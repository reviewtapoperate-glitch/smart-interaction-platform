import express from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { getPaymentAdapter } from "../payments/index.js";
import { getSessionBill, closeSessionIfPaid } from "../services/billing.js";
import { recordEvent } from "../services/analytics.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();
const paymentRequestSchema = z.object({
  provider: z.literal("MPESA"),
  phone: z.string().min(7).max(40),
  selectedItemIds: z.array(z.string()).min(1)
}).strict();

router.post("/session/:token/request", asyncRoute(async (req, res) => {
  const data = paymentRequestSchema.parse(req.body);
  const idempotencyKey = req.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length > 120) return res.status(400).json({ error: "A valid Idempotency-Key header is required" });

  const session = await prisma.session.findUnique({ where: { publicToken: req.params.token } });
  if (!session || session.status !== "ACTIVE") return res.status(409).json({ error: "Session is not active" });

  const existingByKey = await prisma.payment.findUnique({ where: { idempotencyKey } });
  if (existingByKey) {
    if (existingByKey.sessionId !== session.id) return res.status(409).json({ error: "Idempotency key was already used" });
    return res.json({ paymentId: existingByKey.id, status: existingByKey.status, providerReference: existingByKey.providerReference, reused: true });
  }

  const bill = await getSessionBill(session.id);
  const allowed = new Map(bill.items.map(item => [item.id, item]));
  const uniqueItemIds = [...new Set(data.selectedItemIds)];
  const selected = uniqueItemIds.map(id => allowed.get(id)).filter(Boolean);
  if (uniqueItemIds.length !== data.selectedItemIds.length || selected.length !== uniqueItemIds.length) {
    return res.status(400).json({ error: "One or more selected items are invalid or already paid" });
  }

  const amountMinor = selected.reduce((sum, item) => sum + item.totalMinor, 0);
  const business = await prisma.business.findUnique({ where: { id: session.businessId }, select: { currency: true } });
  const payment = await prisma.$transaction(async tx => {
    const conflicting = await tx.payment.findFirst({
      where: { sessionId: session.id, status: { in: ["CREATED", "PENDING"] }, selectedItemIds: { hasSome: uniqueItemIds } }
    });
    if (conflicting) {
      const error = new Error("A payment is already in progress for one or more selected items");
      error.status = 409;
      throw error;
    }
    return tx.payment.create({
      data: {
        businessId: session.businessId, sessionId: session.id, provider: data.provider, amountMinor,
        currency: business.currency, status: "CREATED", phone: data.phone, idempotencyKey,
        selectedItemIds: uniqueItemIds,
        allocation: selected.map(item => ({ itemId: item.id, quantity: item.quantity, paidQuantity: item.paidQuantity }))
      }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  try {
    const adapter = getPaymentAdapter(data.provider);
    const result = await adapter.initiate({ amountMinor, phone: data.phone, accountReference: payment.id, description: `ReviewTap payment ${payment.id}` });
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PENDING", providerReference: result.providerReference, providerPayload: result.raw }
    });
    await recordEvent({ businessId: session.businessId, sessionId: session.id, eventName: "PAYMENT_INITIATED", metadata: { paymentId: payment.id, provider: data.provider, amountMinor } });
    res.status(201).json({ paymentId: updated.id, status: updated.status, providerReference: updated.providerReference, reused: false });
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", providerPayload: { error: error.message } } });
    throw error;
  }
}));

router.get("/:paymentId", asyncRoute(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.paymentId },
    select: { id: true, provider: true, providerReference: true, amountMinor: true, currency: true, status: true, createdAt: true, completedAt: true }
  });
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  res.json(payment);
}));

router.post("/mpesa/callback", express.json({ type: "*/*" }), asyncRoute(async (req, res) => {
  const body = req.body;
  const callback = body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) return res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  const payment = await prisma.payment.findFirst({ where: { provider: "MPESA", providerReference: callback.CheckoutRequestID } });
  if (!payment || ["SUCCESS", "FAILED", "REQUIRES_REVIEW"].includes(payment.status)) return res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  const resultCode = Number(callback.ResultCode);
  const metadata = Array.isArray(callback.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [];
  const receipt = metadata.find(item => item.Name === "MpesaReceiptNumber")?.Value || null;
  if (resultCode !== 0) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", providerPayload: body } });
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const outcome = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${payment.sessionId} FOR UPDATE`;
    const current = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!current || ["SUCCESS", "FAILED", "REQUIRES_REVIEW"].includes(current.status)) return current?.status || "MISSING";

    const allocation = Array.isArray(current.allocation) ? current.allocation : [];
    const itemIds = allocation.map(item => item.itemId);
    const items = await tx.orderItem.findMany({ where: { id: { in: itemIds } } });
    const itemById = new Map(items.map(item => [item.id, item]));
    const allocationValid = allocation.length > 0 && allocation.every(entry => {
      const item = itemById.get(entry.itemId);
      return item && item.paidQuantity === entry.paidQuantity && item.quantity >= entry.paidQuantity + entry.quantity;
    });
    if (!allocationValid) {
      await tx.payment.update({ where: { id: current.id }, data: { status: "REQUIRES_REVIEW", providerPayload: body, completedAt: new Date() } });
      return "REQUIRES_REVIEW";
    }

    const claimed = await tx.payment.updateMany({
      where: { id: current.id, status: { in: ["CREATED", "PENDING"] } },
      data: { status: "SUCCESS", providerPayload: body, completedAt: new Date() }
    });
    if (claimed.count !== 1) return "IGNORED";
    for (const entry of allocation) await tx.orderItem.update({ where: { id: entry.itemId }, data: { paidQuantity: entry.paidQuantity + entry.quantity } });
    await closeSessionIfPaid(tx, current.sessionId);
    return "SUCCESS";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (outcome === "SUCCESS") {
    await recordEvent({ businessId: payment.businessId, sessionId: payment.sessionId, eventName: "PAYMENT_CONFIRMED", metadata: { paymentId: payment.id, receipt } });
    req.app.get("io").to(`session:${payment.sessionId}`).emit("payment:confirmed", { paymentId: payment.id, status: "SUCCESS", receipt });
  } else if (outcome === "REQUIRES_REVIEW") {
    await recordEvent({ businessId: payment.businessId, sessionId: payment.sessionId, eventName: "PAYMENT_REQUIRES_REVIEW", metadata: { paymentId: payment.id, receipt } });
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
}));

export default router;
