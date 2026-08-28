import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { authRequired } from "../utils/auth.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();
router.use(authRequired);

const payload = z.object({
  businessType: z.string().min(1).max(80),
  operations: z.record(z.string(), z.boolean()).default({}),
  integrations: z.array(z.string()).default([]),
  payments: z.array(z.string()).default([]),
  hardware: z.object({ nfc: z.boolean().default(false), qr: z.boolean().default(true), quantity: z.coerce.number().int().min(0).max(10000).default(0) }).default({}),
  locations: z.array(z.string().min(1).max(120)).default([]),
  staff: z.object({ quantity: z.coerce.number().int().min(0).max(10000).default(0), roles: z.array(z.string()).default([]) }).default({}),
  notes: z.string().max(4000).optional().nullable()
});

router.get("/me", asyncRoute(async (req, res) => {
  const result = await prisma.$queryRawUnsafe(`SELECT * FROM "OnboardingRequest" WHERE "businessId" = $1 LIMIT 1`, req.auth.businessId);
  res.json(result[0] || null);
}));

router.put("/me", asyncRoute(async (req, res) => {
  const data = payload.parse(req.body);
  const id = randomUUID();
  const result = await prisma.$queryRawUnsafe(`
    INSERT INTO "OnboardingRequest" ("id","businessId","status","businessType","operations","integrations","payments","hardware","locations","staff","notes")
    VALUES ($1,$2,'SUBMITTED',$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10)
    ON CONFLICT ("businessId") DO UPDATE SET
      "status"='SUBMITTED', "businessType"=EXCLUDED."businessType", "operations"=EXCLUDED."operations",
      "integrations"=EXCLUDED."integrations", "payments"=EXCLUDED."payments", "hardware"=EXCLUDED."hardware",
      "locations"=EXCLUDED."locations", "staff"=EXCLUDED."staff", "notes"=EXCLUDED."notes", "updatedAt"=CURRENT_TIMESTAMP
    RETURNING *`,
    id, req.auth.businessId, data.businessType, JSON.stringify(data.operations), JSON.stringify(data.integrations),
    JSON.stringify(data.payments), JSON.stringify(data.hardware), JSON.stringify(data.locations), JSON.stringify(data.staff), data.notes || null
  );
  res.json(result[0]);
}));

router.get("/quotes", asyncRoute(async (req, res) => {
  const quotes = await prisma.$queryRawUnsafe(`SELECT * FROM "Quote" WHERE "businessId" = $1 ORDER BY "createdAt" DESC`, req.auth.businessId);
  res.json(quotes);
}));

router.post("/quotes/:id/accept", asyncRoute(async (req, res) => {
  const result = await prisma.$queryRawUnsafe(`UPDATE "Quote" SET "status"='ACCEPTED', "acceptedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "businessId"=$2 RETURNING *`, req.params.id, req.auth.businessId);
  if (!result[0]) return res.status(404).json({ error: "Quote not found" });
  res.json(result[0]);
}));

export default router;
