import express from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { authRequired } from "../utils/auth.js";
import { asyncRoute } from "../utils/http.js";
import { toMinor } from "../utils/tokens.js";

const router = express.Router();
router.use(authRequired);

router.get("/", asyncRoute(async (req, res) => {
  const products = await prisma.product.findMany({
    where: { businessId: req.auth.businessId },
    orderBy: { createdAt: "desc" }
  });
  res.json(products);
}));

router.post("/", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(1).max(150),
    description: z.string().max(500).optional(),
    sku: z.string().max(80).optional(),
    price: z.number().nonnegative(),
    currency: z.string().length(3).optional()
  }).parse(req.body);

  const business = await prisma.business.findUnique({
    where: { id: req.auth.businessId },
    select: { currency: true }
  });
  const product = await prisma.product.create({
    data: {
      businessId: req.auth.businessId,
      name: data.name,
      description: data.description,
      sku: data.sku,
      priceMinor: toMinor(data.price),
      currency: data.currency || business.currency
    }
  });

  res.status(201).json(product);
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(1).max(150).optional(),
    description: z.string().max(500).nullable().optional(),
    price: z.number().nonnegative().optional(),
    active: z.boolean().optional()
  }).parse(req.body);

  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: req.auth.businessId }
  });

  if (!existing) return res.status(404).json({ error: "Product not found" });

  const product = await prisma.product.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      description: data.description,
      priceMinor: data.price === undefined ? undefined : toMinor(data.price),
      active: data.active
    }
  });

  res.json(product);
}));

export default router;
