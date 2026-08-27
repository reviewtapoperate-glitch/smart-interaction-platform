import express from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { authRequired } from "../utils/auth.js";
import { asyncRoute, assertBusiness } from "../utils/http.js";
import { audit } from "../services/audit.js";

const router = express.Router();
router.use(authRequired);

router.get("/me", asyncRoute(async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { id: req.auth.businessId },
    include: { subscription: true }
  });
  res.json(business);
}));

router.patch("/me", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(2).max(120).optional(),
    websiteUrl: z.url().nullable().optional(),
    googleBusinessUrl: z.url().nullable().optional(),
    currency: z.string().length(3).optional(),
    timezone: z.string().min(1).optional()
  }).parse(req.body);

  const business = await prisma.business.update({
    where: { id: req.auth.businessId },
    data
  });

  await audit({
    businessId: req.auth.businessId,
    userId: req.auth.sub,
    action: "BUSINESS_UPDATED",
    entityType: "Business",
    entityId: business.id,
    metadata: data
  });

  res.json(business);
}));

router.get("/branches", asyncRoute(async (req, res) => {
  res.json(await prisma.branch.findMany({
    where: { businessId: req.auth.businessId },
    orderBy: { createdAt: "asc" }
  }));
}));

router.post("/branches", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(2),
    code: z.string().min(1).max(30),
    address: z.string().max(250).optional()
  }).parse(req.body);

  const branch = await prisma.branch.create({
    data: { businessId: req.auth.businessId, ...data }
  });

  res.status(201).json(branch);
}));

router.get("/staff", asyncRoute(async (req, res) => {
  res.json(await prisma.user.findMany({
    where: { businessId: req.auth.businessId, active: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" }
  }));
}));

export default router;
