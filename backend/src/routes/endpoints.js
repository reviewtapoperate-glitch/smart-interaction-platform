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
    actionProfile: z.record(z.string(), z.any()).optional()
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
