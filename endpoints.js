import express from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { authRequired } from "../utils/auth.js";
import { asyncRoute } from "../utils/http.js";
import { randomToken } from "../utils/tokens.js";
import { audit } from "../services/audit.js";

const router = express.Router();
router.use(authRequired);

const actionProfileSchema = z.object({
  reviewUrl: z.url().nullable().optional(),
  whatsappUrl: z.url().nullable().optional(),
  websiteUrl: z.url().nullable().optional(),
  socialUrl: z.url().nullable().optional(),
  directionsUrl: z.url().nullable().optional(),
  allowOrdering: z.boolean().optional()
}).strict();

router.get("/", asyncRoute(async (req, res) => {
  const endpoints = await prisma.endpoint.findMany({
    where: { businessId: req.auth.businessId },
    include: { branch: true },
    orderBy: { createdAt: "desc" }
  });

  res.json(endpoints.map(e => ({
    ...e,
    publicUrl: `${env.PUBLIC_BASE_URL}/e/${e.publicToken}`
  })));
}));

router.post("/", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(1).max(100),
    code: z.string().min(1).max(50),
    type: z.enum(["TABLE", "ROOM", "PRODUCT", "SERVICE", "WAITER", "EVENT", "CUSTOM"]),
    branchId: z.string().nullable().optional(),
    actionProfile: actionProfileSchema.optional()
  }).parse(req.body);

  if (data.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: data.branchId, businessId: req.auth.businessId }
    });
    if (!branch) return res.status(400).json({ error: "Invalid branch" });
  }

  const endpoint = await prisma.endpoint.create({
    data: {
      businessId: req.auth.businessId,
      branchId: data.branchId || null,
      name: data.name,
      code: data.code,
      type: data.type,
      actionProfile: data.actionProfile || null,
      publicToken: randomToken(18)
    }
  });

  await audit({
    businessId: req.auth.businessId,
    userId: req.auth.sub,
    action: "ENDPOINT_CREATED",
    entityType: "Endpoint",
    entityId: endpoint.id
  });

  res.status(201).json({
    ...endpoint,
    publicUrl: `${env.PUBLIC_BASE_URL}/e/${endpoint.publicToken}`
  });
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(1).max(100).optional(),
    code: z.string().min(1).max(50).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    nfcEnabled: z.boolean().optional(),
    qrEnabled: z.boolean().optional(),
    branchId: z.string().nullable().optional(),
    actionProfile: actionProfileSchema.nullable().optional()
  }).strict().parse(req.body);

  const endpoint = await prisma.endpoint.findFirst({
    where: { id: req.params.id, businessId: req.auth.businessId }
  });
  if (!endpoint) return res.status(404).json({ error: "Endpoint not found" });

  if (data.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: data.branchId, businessId: req.auth.businessId } });
    if (!branch) return res.status(400).json({ error: "Invalid branch" });
  }

  const updated = await prisma.endpoint.update({ where: { id: endpoint.id }, data });
  await audit({
    businessId: req.auth.businessId,
    userId: req.auth.sub,
    action: "ENDPOINT_UPDATED",
    entityType: "Endpoint",
    entityId: updated.id,
    metadata: data
  });
  res.json({ ...updated, publicUrl: `${env.PUBLIC_BASE_URL}/e/${updated.publicToken}` });
}));

router.get("/:id/qr", asyncRoute(async (req, res) => {
  const endpoint = await prisma.endpoint.findFirst({
    where: { id: req.params.id, businessId: req.auth.businessId }
  });

  if (!endpoint) return res.status(404).json({ error: "Endpoint not found" });

  const url = `${env.PUBLIC_BASE_URL}/e/${endpoint.publicToken}`;
  const png = await QRCode.toBuffer(url, { width: 700, margin: 2 });
  res.type("png").send(png);
}));

export default router;
