import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { signToken } from "../utils/auth.js";
import { slugify } from "../utils/tokens.js";
import { asyncRoute } from "../utils/http.js";
import { audit } from "../services/audit.js";

const router = express.Router();

const registerSchema = z.object({
  businessName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.email(),
  password: z.string().min(8).max(128)
});

router.post("/register", asyncRoute(async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const baseSlug = slugify(data.businessName) || "business";
  let slug = baseSlug;
  let counter = 2;
  while (await prisma.business.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const result = await prisma.$transaction(async tx => {
    const business = await tx.business.create({
      data: {
        name: data.businessName,
        slug,
        subscription: {
          create: { plan: "SMART", status: "TRIAL" }
        }
      }
    });

    const user = await tx.user.create({
      data: {
        businessId: business.id,
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: "OWNER"
      }
    });

    await tx.auditLog.create({
      data: {
        businessId: business.id,
        userId: user.id,
        action: "BUSINESS_REGISTERED",
        entityType: "Business",
        entityId: business.id
      }
    });

    return { business, user };
  });

  const token = signToken(result.user);
  res.status(201).json({
    token,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
      businessId: result.user.businessId
    },
    business: result.business
  });
}));

router.post("/login", asyncRoute(async (req, res) => {
  const data = z.object({
    email: z.email(),
    password: z.string().min(1)
  }).parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
    include: { business: true }
  });

  if (!user || !user.active || !(await bcrypt.compare(data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId
    },
    business: user.business
  });
}));

export default router;
