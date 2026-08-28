import express from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { randomToken } from "../utils/tokens.js";
import { asyncRoute } from "../utils/http.js";
import { recordEvent } from "../services/analytics.js";
import { getSessionBill } from "../services/billing.js";

const router = express.Router();

const endpointActions = ["REVIEW_CLICKED", "WHATSAPP_CLICKED", "WEBSITE_CLICKED", "SOCIAL_CLICKED", "DIRECTIONS_CLICKED"];

router.get("/endpoint/:token", asyncRoute(async (req, res) => {
  const endpoint = await prisma.endpoint.findUnique({
    where: { publicToken: req.params.token },
    include: { business: true, branch: true }
  });

  if (!endpoint || endpoint.status !== "ACTIVE") {
    return res.status(404).json({ error: "Endpoint not found or inactive" });
  }

  const activeSession = await prisma.session.findFirst({
    where: { endpointId: endpoint.id, status: "ACTIVE" },
    orderBy: { startedAt: "desc" }
  });

  await recordEvent({
    businessId: endpoint.businessId,
    endpointId: endpoint.id,
    sessionId: activeSession?.id,
    eventName: "ENDPOINT_OPENED",
    metadata: { method: req.headers["user-agent"] || "unknown" }
  });

  res.json({
    endpoint: {
      id: endpoint.id,
      name: endpoint.name,
      type: endpoint.type,
      actionProfile: endpoint.actionProfile,
      branch: endpoint.branch?.name || null
    },
    business: {
      id: endpoint.business.id,
      name: endpoint.business.name,
      currency: endpoint.business.currency,
      logoUrl: endpoint.business.logoUrl
    },
    activeSession: activeSession ? { id: activeSession.id, status: activeSession.status } : null
  });
}));

router.post("/endpoint/:token/actions", asyncRoute(async (req, res) => {
  const data = z.object({ action: z.enum(endpointActions) }).strict().parse(req.body);
  const endpoint = await prisma.endpoint.findUnique({ where: { publicToken: req.params.token } });
  if (!endpoint || endpoint.status !== "ACTIVE") {
    return res.status(404).json({ error: "Endpoint not found or inactive" });
  }

  await recordEvent({
    businessId: endpoint.businessId,
    endpointId: endpoint.id,
    eventName: data.action
  });
  res.status(201).json({ recorded: true });
}));

router.post("/endpoint/:token/session", asyncRoute(async (req, res) => {
  const endpoint = await prisma.endpoint.findUnique({
    where: { publicToken: req.params.token }
  });

  if (!endpoint || endpoint.status !== "ACTIVE") {
    return res.status(404).json({ error: "Endpoint not found or inactive" });
  }

  const existing = await prisma.session.findFirst({
    where: { endpointId: endpoint.id, status: "ACTIVE" },
    orderBy: { startedAt: "desc" }
  });

  if (existing) {
    return res.json({ session: existing, existing: true });
  }

  const data = z.object({
    guestName: z.string().max(120).optional(),
    guestPhone: z.string().max(40).optional()
  }).parse(req.body || {});

  const session = await prisma.session.create({
    data: {
      businessId: endpoint.businessId,
      branchId: endpoint.branchId,
      endpointId: endpoint.id,
      publicToken: randomToken(18),
      guestName: data.guestName,
      guestPhone: data.guestPhone
    }
  });

  await recordEvent({
    businessId: endpoint.businessId,
    endpointId: endpoint.id,
    sessionId: session.id,
    eventName: "SESSION_STARTED"
  });

  res.status(201).json({ session, existing: false });
}));

router.get("/session/:token", asyncRoute(async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { publicToken: req.params.token },
    include: {
      business: true,
      endpoint: true,
      orders: {
        where: { status: { not: "CANCELLED" } },
        include: { items: true, staff: { select: { name: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!session) return res.status(404).json({ error: "Session not found" });

  const bill = await getSessionBill(session.id);

  res.json({
    session: {
      id: session.id,
      token: session.publicToken,
      status: session.status,
      endpoint: session.endpoint.name
    },
    business: {
      name: session.business.name,
      currency: session.business.currency
    },
    orders: session.orders,
    bill
  });
}));

router.get("/session/:token/products", asyncRoute(async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { publicToken: req.params.token }
  });

  if (!session) return res.status(404).json({ error: "Session not found" });

  res.json(await prisma.product.findMany({
    where: { businessId: session.businessId, active: true },
    orderBy: { name: "asc" }
  }));
}));

router.post("/session/:token/orders", asyncRoute(async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { publicToken: req.params.token }
  });

  if (!session || session.status !== "ACTIVE") {
    return res.status(409).json({ error: "Session is not active" });
  }

  const data = z.object({
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number().int().positive().max(100)
    })).min(1),
    notes: z.string().max(500).optional()
  }).parse(req.body);

  const products = await prisma.product.findMany({
    where: {
      businessId: session.businessId,
      id: { in: data.items.map(i => i.productId) },
      active: true
    }
  });

  const byId = new Map(products.map(p => [p.id, p]));

  for (const item of data.items) {
    if (!byId.has(item.productId)) {
      return res.status(400).json({ error: `Invalid product: ${item.productId}` });
    }
  }

  const order = await prisma.order.create({
    data: {
      businessId: session.businessId,
      branchId: session.branchId,
      sessionId: session.id,
      notes: data.notes,
      status: "SUBMITTED",
      items: {
        create: data.items.map(item => {
          const product = byId.get(item.productId);
          return {
            productId: product.id,
            quantity: item.quantity,
            unitPriceMinor: product.priceMinor,
            nameSnapshot: product.name
          };
        })
      }
    },
    include: { items: true }
  });

  await recordEvent({
    businessId: session.businessId,
    endpointId: session.endpointId,
    sessionId: session.id,
    eventName: "ORDER_CREATED",
    metadata: { orderId: order.id }
  });

  req.app.get("io").to(`session:${session.id}`).emit("order:created", order);

  res.status(201).json(order);
}));

export default router;
