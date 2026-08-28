import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { platformAdminKey, env } from "../config/env.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();
function adminRequired(req, res, next) {
  const key = req.headers["x-reviewtap-admin-key"];
  if (!key || key !== platformAdminKey) return res.status(404).json({ error: "Not found" });
  next();
}
router.use(adminRequired);
router.get("/overview", asyncRoute(async (_req, res) => {
  const [businesses, users, endpoints, sessions, orders, payments, interactions, onboarding, quotes, nfc] = await Promise.all([
    prisma.business.count(), prisma.user.count(), prisma.endpoint.count(), prisma.session.count(), prisma.order.count(),
    prisma.payment.aggregate({ _sum: { amountMinor: true }, _count: { _all: true }, where: { status: "SUCCESS" } }),
    prisma.analyticsEvent.count(),
    prisma.$queryRawUnsafe(`SELECT status, COUNT(*)::int AS count FROM "OnboardingRequest" GROUP BY status ORDER BY status`),
    prisma.$queryRawUnsafe(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM("setupMinor"),0)::int AS "setupMinor", COALESCE(SUM("monthlyMinor"),0)::int AS "monthlyMinor" FROM "Quote" GROUP BY status ORDER BY status`),
    prisma.$queryRawUnsafe(`SELECT status, COUNT(*)::int AS count FROM "NfcTag" GROUP BY status ORDER BY status`)
  ]);
  res.json({ businesses, users, endpoints, sessions, orders, interactions, successfulPayments: payments._count._all, successfulPaymentValueMinor: payments._sum.amountMinor || 0, onboarding, quotes, nfc });
}));
router.get("/businesses", asyncRoute(async (_req, res) => {
  const rows = await prisma.business.findMany({ include: { subscription: true }, orderBy: { createdAt: "desc" } });
  const counts = await prisma.$queryRawUnsafe(`SELECT "businessId", COUNT(*)::int AS count FROM "Quote" GROUP BY "businessId"`);
  const map = new Map(counts.map(row => [row.businessId, row.count]));
  res.json(rows.map(b => ({ ...b, quoteCount: map.get(b.id) || 0 })));
}));
router.get("/onboarding", asyncRoute(async (_req, res) => {
  res.json(await prisma.$queryRawUnsafe(`SELECT o.*, b.name AS "businessName", b."createdAt" AS "businessCreatedAt" FROM "OnboardingRequest" o JOIN "Business" b ON b.id=o."businessId" ORDER BY o."updatedAt" DESC`));
}));
router.post("/quotes", asyncRoute(async (req, res) => {
  const data = z.object({ businessId: z.string().min(1), currency: z.string().length(3).default("KES"), setupMinor: z.coerce.number().int().min(0).default(0), monthlyMinor: z.coerce.number().int().min(0).default(0), items: z.array(z.object({ name: z.string().min(1), amountMinor: z.coerce.number().int().min(0) })).default([]), notes: z.string().max(4000).optional().nullable() }).parse(req.body);
  const subtotalMinor = data.items.reduce((sum, item) => sum + item.amountMinor, 0);
  const result = await prisma.$queryRawUnsafe(`INSERT INTO "Quote" ("id","businessId","status","currency","subtotalMinor","setupMinor","monthlyMinor","notes","items") VALUES ($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`, randomUUID(), data.businessId, data.currency, subtotalMinor, data.setupMinor, data.monthlyMinor, data.notes || null, JSON.stringify(data.items));
  res.status(201).json(result[0]);
}));
router.patch("/quotes/:id", asyncRoute(async (req, res) => {
  const data = z.object({ status: z.enum(["DRAFT","SENT","ACCEPTED","DECLINED","EXPIRED"]).optional(), notes: z.string().max(4000).optional().nullable() }).parse(req.body);
  const result = await prisma.$queryRawUnsafe(`UPDATE "Quote" SET "status"=COALESCE($2,"status"), "notes"=COALESCE($3,"notes"), "sentAt"=CASE WHEN $2='SENT' THEN CURRENT_TIMESTAMP ELSE "sentAt" END, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 RETURNING *`, req.params.id, data.status || null, data.notes ?? null);
  if (!result[0]) return res.status(404).json({ error: "Quote not found" });
  res.json(result[0]);
}));
router.get("/nfc", asyncRoute(async (_req, res) => {
  res.json(await prisma.$queryRawUnsafe(`SELECT n.*, b.name AS "businessName", e.name AS "endpointName", e."publicToken" FROM "NfcTag" n LEFT JOIN "Business" b ON b.id=n."businessId" LEFT JOIN "Endpoint" e ON e.id=n."endpointId" ORDER BY n."createdAt" DESC`));
}));
router.post("/nfc", asyncRoute(async (req, res) => {
  const data = z.object({ inventoryCode: z.string().min(3).max(80), businessId: z.string().optional().nullable(), endpointId: z.string().optional().nullable() }).parse(req.body);
  let writeUrl = null;
  if (data.endpointId) {
    const endpoint = await prisma.endpoint.findUnique({ where: { id: data.endpointId }, select: { publicToken: true } });
    if (!endpoint) return res.status(404).json({ error: "Endpoint not found" });
    writeUrl = `${env.PUBLIC_BASE_URL}/e/${endpoint.publicToken}`;
  }
  res.status(201).json((await prisma.$queryRawUnsafe(`INSERT INTO "NfcTag" ("id","inventoryCode","businessId","endpointId","writeUrl") VALUES ($1,$2,$3,$4,$5) RETURNING *`, randomUUID(), data.inventoryCode, data.businessId || null, data.endpointId || null, writeUrl))[0]);
}));
router.patch("/nfc/:id", asyncRoute(async (req, res) => {
  const data = z.object({ status: z.enum(["UNASSIGNED","ASSIGNED","WRITTEN","TESTED","DEPLOYED","RETIRED"]).optional(), endpointId: z.string().optional().nullable(), businessId: z.string().optional().nullable() }).parse(req.body);
  let writeUrl = null;
  if (data.endpointId) {
    const endpoint = await prisma.endpoint.findUnique({ where: { id: data.endpointId }, select: { publicToken: true } });
    if (!endpoint) return res.status(404).json({ error: "Endpoint not found" });
    writeUrl = `${env.PUBLIC_BASE_URL}/e/${endpoint.publicToken}`;
  }
  const result = await prisma.$queryRawUnsafe(`UPDATE "NfcTag" SET "status"=COALESCE($2,"status"), "endpointId"=COALESCE($3,"endpointId"), "businessId"=COALESCE($4,"businessId"), "writeUrl"=COALESCE($5,"writeUrl"), "writtenAt"=CASE WHEN $2='WRITTEN' THEN CURRENT_TIMESTAMP ELSE "writtenAt" END, "testedAt"=CASE WHEN $2='TESTED' THEN CURRENT_TIMESTAMP ELSE "testedAt" END, "deployedAt"=CASE WHEN $2='DEPLOYED' THEN CURRENT_TIMESTAMP ELSE "deployedAt" END, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 RETURNING *`, req.params.id, data.status || null, data.endpointId ?? null, data.businessId ?? null, writeUrl);
  if (!result[0]) return res.status(404).json({ error: "NFC tag not found" });
  res.json(result[0]);
}));
export default router;
