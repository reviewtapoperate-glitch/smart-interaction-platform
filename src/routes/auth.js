import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { randomToken, slugify } from "../utils/tokens.js";
import { signToken } from "../utils/auth.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();

async function createAccessCode(userId, businessId) {
  for (let i = 0; i < 8; i++) {
    const accessCode = `RT-${randomToken(6).replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase()}`;
    try {
      const row = await prisma.$queryRawUnsafe(`INSERT INTO "OwnerAccess" ("id","userId","businessId","accessCode") VALUES ($1,$2,$3,$4) ON CONFLICT ("userId") DO UPDATE SET "accessCode"=EXCLUDED."accessCode", "updatedAt"=CURRENT_TIMESTAMP RETURNING "accessCode"`, randomToken(12), userId, businessId, accessCode);
      return row[0]?.accessCode || accessCode;
    } catch (error) {
      if (!String(error.message).includes("OwnerAccess_accessCode_key")) throw error;
    }
  }
  throw new Error("Could not generate access code");
}

async function issue(user, business) {
  const token = signToken(user);
  const access = await prisma.$queryRawUnsafe(`SELECT "accessCode" FROM "OwnerAccess" WHERE "userId"=$1 LIMIT 1`, user.id);
  const accessCode = access[0]?.accessCode || await createAccessCode(user.id, business.id);
  return { token, accessCode, user: { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId }, business };
}

router.post("/register", asyncRoute(async (req, res) => {
  const data = z.object({ businessName: z.string().min(2).max(120), name: z.string().min(2).max(120), email: z.email(), password: z.string().min(8).max(128) }).parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: "Email already registered" });
  const baseSlug = slugify(data.businessName) || "business";
  let slug = baseSlug, counter = 2;
  while (await prisma.business.findUnique({ where: { slug } })) slug = `${baseSlug}-${counter++}`;
  const passwordHash = await bcrypt.hash(data.password, 12);
  const result = await prisma.$transaction(async tx => {
    const business = await tx.business.create({ data: { name: data.businessName, slug, subscription: { create: { plan: "SMART", status: "TRIAL" } } } });
    const user = await tx.user.create({ data: { businessId: business.id, name: data.name, email: data.email.toLowerCase(), passwordHash, role: "OWNER" } });
    await tx.auditLog.create({ data: { businessId: business.id, userId: user.id, action: "BUSINESS_REGISTERED", entityType: "Business", entityId: business.id } });
    return { business, user };
  });
  res.status(201).json(await issue(result.user, result.business));
}));

router.post("/login", asyncRoute(async (req, res) => {
  const data = z.object({ email: z.email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() }, include: { business: true } });
  if (!user || !user.active || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
  res.json(await issue(user, user.business));
}));

router.post("/access-login", asyncRoute(async (req, res) => {
  const data = z.object({ accessCode: z.string().trim().min(6).max(32) }).parse(req.body);
  const rows = await prisma.$queryRawUnsafe(`SELECT "userId" FROM "OwnerAccess" WHERE UPPER("accessCode")=UPPER($1) LIMIT 1`, data.accessCode);
  if (!rows[0]) return res.status(401).json({ error: "Invalid access code" });
  const user = await prisma.user.findUnique({ where: { id: rows[0].userId }, include: { business: true } });
  if (!user || !user.active || user.role !== "OWNER") return res.status(401).json({ error: "Invalid access code" });
  res.json(await issue(user, user.business));
}));

router.post("/access-regenerate", asyncRoute(async (req, res) => {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!auth) return res.status(401).json({ error: "Authentication required" });
  const { verifyToken } = await import("../utils/auth.js");
  const payload = verifyToken(auth);
  if (!payload?.sub || payload.role !== "OWNER") return res.status(403).json({ error: "Owner access required" });
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { business: true } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ accessCode: await createAccessCode(user.id, user.businessId) });
}));

export default router;
