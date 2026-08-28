import express from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { authRequired } from "../utils/auth.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();
router.use(authRequired);

router.get("/", asyncRoute(async (req, res) => {
  res.json(await prisma.event.findMany({
    where: { businessId: req.auth.businessId },
    orderBy: { startsAt: "desc" }
  }));
}));

router.post("/", asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().min(2).max(150),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    branchId: z.string().nullable().optional()
  }).parse(req.body);

  if (data.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: data.branchId, businessId: req.auth.businessId }
    });
    if (!branch) return res.status(400).json({ error: "Invalid branch" });
  }

  const event = await prisma.event.create({
    data: {
      businessId: req.auth.businessId,
      branchId: data.branchId || null,
      name: data.name,
      startsAt: data.startsAt,
      endsAt: data.endsAt
    }
  });

  res.status(201).json(event);
}));

export default router;
