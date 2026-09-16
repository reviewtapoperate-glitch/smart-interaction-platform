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
const actionProfileSchema = z.record(z.string().max(80), z.unknown());

router.get("/", asyncRoute(async (req, res) => {
  const endpoints = await prisma.endpoint.findMany({ where: { businessId: req.auth.businessId }, include: { branch: true }, orderBy: { createdAt: "desc" } });
  res.json(endpoints.map(e => ({ ...e, publicUrl: `${env.PUBLIC_BASE_URL}/e/${e.publicToken}` })));
}));

router.post("/", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(1).max(100), code: z.string().min(1).max(50),
    type: z.enum(["TABLE", "ROOM", "PRODUCT", "SERVICE", "WAITER", "EVENT", "CUSTOM"]),
    branchId: z.string().nullable().optional(), actionProfile: actionProfileSchema.optional()
  }).parse(req.body);
  if (data.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: data.branchId, businessId: req.auth.businessId } });
    if (!branch) return res.status(400).json({ error: "Invalid branch" });
  }
  const requestedLinkId = typeof data.actionProfile?.linkId === "string" ? data.actionProfile.linkId : null;
  const publicToken = requestedLinkId || randomToken(18);
  if (!/^[A-Za-z0-9_-]+$/.test(publicToken)) return res.status(400).json({ error: "Invalid Link ID" });
  const existingToken = await prisma.endpoint.findUnique({ where: { publicToken } });
  if (existingToken) return res.status(409).json({ error: "Link ID is already in use" });
  const endpoint = await prisma.endpoint.create({ data: { businessId: req.auth.businessId, branchId: data.branchId || null, name: data.name, code: data.code, type: data.type, actionProfile: data.actionProfile || null, publicToken } });
  await audit({ businessId: req.auth.businessId, userId: req.auth.sub, action: "ENDPOINT_CREATED", entityType: "Endpoint", entityId: endpoint.id });
  res.status(201).json({ ...endpoint, publicUrl: `${env.PUBLIC_BASE_URL}/e/${endpoint.publicToken}` });
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(1).max(100).optional(), code: z.string().min(1).max(50).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(), nfcEnabled: z.boolean().optional(), qrEnabled: z.boolean().optional(),
    branchId: z.string().nullable().optional(), publicToken: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
    actionProfile: actionProfileSchema.nullable().optional()
  }).strict().parse(req.body);
  const endpoint = await prisma.endpoint.findFirst({ where: { id: req.params.id, businessId: req.auth.businessId } });
  if (!endpoint) return res.status(404).json({ error: "Endpoint not found" });
  if (data.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: data.branchId, businessId: req.auth.businessId } });
    if (!branch) return res.status(400).json({ error: "Invalid branch" });
  }
  if (data.publicToken && data.publicToken !== endpoint.publicToken) {
    const collision = await prisma.endpoint.findUnique({ where: { publicToken: data.publicToken } });
    if (collision) return res.status(409).json({ error: "Link ID is already in use" });
  }
  const updated = await prisma.endpoint.update({ where: { id: endpoint.id }, data });
  await audit({ businessId: req.auth.businessId, userId: req.auth.sub, action: "ENDPOINT_UPDATED", entityType: "Endpoint", entityId: updated.id, metadata: data });
  res.json({ ...updated, publicUrl: `${env.PUBLIC_BASE_URL}/e/${updated.publicToken}` });
}));

router.get("/:id/qr", asyncRoute(async (req, res) => {
  const endpoint = await prisma.endpoint.findFirst({ where: { id: req.params.id, businessId: req.auth.businessId } });
  if (!endpoint) return res.status(404).json({ error: "Endpoint not found" });
  const section = typeof req.query.section === "string" && /^[a-z0-9_-]+$/i.test(req.query.section) ? req.query.section : null;
  const url = `${env.PUBLIC_BASE_URL}/e/${endpoint.publicToken}${section ? `?section=${encodeURIComponent(section)}` : ""}`;
  const png = await QRCode.toBuffer(url, { width: 700, margin: 2 });
  res.type("png").send(png);
}));

export default router;
