import express from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { getPaymentAdapter } from "../payments/index.js";
import { getSessionBill, closeSessionIfPaid } from "../services/billing.js";
import { recordEvent } from "../services/analytics.js";
import { randomToken } from "../utils/tokens.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();

router.post("/session/:token/request", asyncRoute(async (req, res) => {
  const data = z.object({
    provider: z.enum(["MPESA", "STRIPE", "PAYSTACK", "FLUTTERWAVE", "PESAPAL", "OTHER"]),
    phone: z.string().max(40).optional(),
    selectedItemIds: z.array(z.string()).min(1)
  }).parse(req.body);

  const session = await prisma.session.findUnique({
    where: { publicToken: req.params.token }
  });

  if (!session || session.status !== "ACTIVE") {
    return res.status(409).json({ error: "Session is not active" });
  }

  const bill = await getSessionBill(session.id);
  const allowed = new Map(bill.items.map(i => [i.id, i]));

  const selected = data.selectedItemIds.map(id => allowed.get(id)).filter(Boolean);
  if (selected.length !== data.selectedItemIds.length) {
    return res.status(400).json({ error: "One or more selected items are invalid or already paid" });
  }

  const amountMinor = selected.reduce((sum, item) => sum + item.totalMinor, 0);
  const idempotencyKey = randomToken(20);

  const payment = await prisma.payment.create({
    data: {
      businessId: session.businessId,
      sessionId: session.id,
      provider: data.provider,
      amountMinor,
      currency: session.businessId ? (await prisma.business.findUnique({ where: { id: session.businessId }, select: { currency: true } })).currency : "KES",
      status: "CREATED",
      phone: data.phone,
      idempotencyKey,
      selectedItemIds: data.selectedItemIds
    }
  });

  try {
    const adapter = getPaymentAdapter(data.provider);
    const result = await adapter.initiate({
      amountMinor,
      phone: data.phone,
      accountReference: payment.id,
      description: `Business payment ${payment.id}`
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PENDING",
        providerReference: result.providerReference,
        providerPayload: result.raw
      }
    });

    await recordEvent({
      businessId: session.businessId,
      sessionId: session.id,
      eventName: "PAYMENT_INITIATED",
      metadata: {
        paymentId: payment.id,
        provider: data.provider,
        amountMinor
      }
    });

    res.status(201).json({
      paymentId: updated.id,
      status: updated.status,
      providerReference: updated.providerReference
    });
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", providerPayload: { error: error.message } }
    });
    throw error;
  }
}));

router.get("/:paymentId", asyncRoute(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.paymentId },
    select: {
      id: true,
      provider: true,
      providerReference: true,
      amountMinor: true,
      currency: true,
      status: true,
      createdAt: true,
      completedAt: true
    }
  });

  if (!payment) return res.status(404).json({ error: "Payment not found" });
  res.json(payment);
}));

/*
 * Safaricom Daraja sends the payment callback to this endpoint.
 * The callback is reconciled against the provider reference stored when
 * the STK request was created. A browser redirect is never treated as
 * proof of payment.
 */
router.post("/mpesa/callback", express.json({ type: "*/*" }), asyncRoute(async (req, res) => {
  const body = req.body;
  const callback = body?.Body?.stkCallback;

  if (!callback?.CheckoutRequestID) {
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const payment = await prisma.payment.findFirst({
    where: {
      provider: "MPESA",
      providerReference: callback.CheckoutRequestID
    }
  });

  if (!payment) {
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (payment.status === "SUCCESS") {
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const resultCode = Number(callback.ResultCode);
  const metadata = Array.isArray(callback.CallbackMetadata?.Item)
    ? callback.CallbackMetadata.Item
    : [];

  const receipt = metadata.find(i => i.Name === "MpesaReceiptNumber")?.Value || null;

  if (resultCode === 0) {
    await prisma.$transaction(async tx => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESS",
          providerPayload: body,
          completedAt: new Date()
        }
      });

      await tx.orderItem.updateMany({
        where: { id: { in: payment.selectedItemIds } },
        data: { paidQuantity: { increment: 1 } }
      });

      await closeSessionIfPaid(tx, payment.sessionId);
    });

    await recordEvent({
      businessId: payment.businessId,
      sessionId: payment.sessionId,
      eventName: "PAYMENT_CONFIRMED",
      metadata: { paymentId: payment.id, receipt }
    });

    req.app.get("io").to(`session:${payment.sessionId}`).emit("payment:confirmed", {
      paymentId: payment.id,
      status: "SUCCESS",
      receipt
    });
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        providerPayload: body
      }
    });
  }

  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
}));

export default router;
