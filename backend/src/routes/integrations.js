import express from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { authRequired } from "../utils/auth.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();
router.use(authRequired);

router.get("/", asyncRoute(async (req, res) => {
  const integrations = await prisma.integration.findMany({
    where: { businessId: req.auth.businessId },
    select: {
      id: true,
      provider: true,
      type: true,
      active: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { provider: "asc" }
  });
  res.json(integrations);
}));

router.post("/", asyncRoute(async (req, res) => {
  const data = z.object({
    provider: z.string().min(2).max(80),
    type: z.string().min(2).max(80),
    active: z.boolean().default(false),
    config: z.record(z.string(), z.any()).optional()
  }).parse(req.body);

  const integration = await prisma.integration.upsert({
    where: {
      businessId_provider_type: {
        businessId: req.auth.businessId,
        provider: data.provider,
        type: data.type
      }
    },
    update: {
      active: data.active,
      config: data.config || undefined
    },
    create: {
      businessId: req.auth.businessId,
      provider: data.provider,
      type: data.type,
      active: data.active,
      config: data.config || null
    }
  });

  res.status(201).json({
    id: integration.id,
    provider: integration.provider,
    type: integration.type,
    active: integration.active
  });
}));

export default router;
