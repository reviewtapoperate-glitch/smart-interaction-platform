import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { randomToken, slugify } from "../utils/tokens.js";
import { signToken, verifyToken } from "../utils/auth.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();

async function createAccessCode(userId, businessId) {
  for (let i = 0; i < 8; i++) {
    const accessCode = `RT-${randomToken(6).replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase()}`;
    const accessCodeHash = await bcrypt.hash(accessCode, 12);
    const accessCodePrefix = accessCode.slice(0, 6).toUpperCase();
    try {
      const row = await prisma.$queryRawUnsafe(
        `INSERT INTO "OwnerAccess" ("id","userId","businessId","accessCodeHash","accessCodePrefix") VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT ("userId") DO UPDATE SET "accessCodeHash"=EXCLUDED."accessCodeHash", "accessCodePrefix"=EXCLUDED."accessCodePrefix", "accessCode"=NULL, "updatedAt"=CURRENT_TIMESTAMP
         RETURNING "accessCodePrefix"`,
        randomToken(12), userId, businessId, accessCodeHash, accessCodePrefix
      );
      if (row[0]) return accessCode;
    } catch (error) {
      if (!String(error.message).includes("OwnerAccess_accessCodePrefix_key")) throw error;
    }
  }
  throw new Error("Could not generate access code");
}

async function issue(user, business) {
  return {
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId },
    business
  };
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
  const accessCode = await createAccessCode(result.user.id, result.business.id);
  res.status(201).json({ ...(await issue(result.user, result.business)), accessCode });
}));

router.post("/login", asyncRoute(async (req, res) => {
  const data = z.object({ email: z.email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() }, include: { business: true } });
  if (!user || !user.active || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
  res.json(await issue(user, user.business));
}));

router.post("/access-login", asyncRoute(async (req, res) => {
  const data = z.object({ accessCode: z.string().trim().min(6).max(32) }).parse(req.body);
  const prefix = data.accessCode.slice(0, 6).toUpperCase();
  const rows = await prisma.$queryRawUnsafe(`SELECT "id","userId","accessCodeHash" FROM "OwnerAccess" WHERE UPPER("accessCodePrefix")=$1 LIMIT 20`, prefix);
  let match = null;
  for (const row of rows) {
    if (row.accessCodeHash && await bcrypt.compare(data.accessCode, row.accessCodeHash)) {
      match = row;
      break;
    }
  }
  if (!match) return res.status(401).json({ error: "Invalid access code" });
  const user = await prisma.user.findUnique({ where: { id: match.userId }, include: { business: true } });
  if (!user || !user.active || user.role !== "OWNER") return res.status(401).json({ error: "Invalid access code" });
  res.json(await issue(user, user.business));
}));

router.post("/access-regenerate", asyncRoute(async (req, res) => {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!auth) return res.status(401).json({ error: "Authentication required" });
  const payload = verifyToken(auth);
  if (!payload?.sub || payload.role !== "OWNER") return res.status(403).json({ error: "Owner access required" });
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { business: true } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ accessCode: await createAccessCode(user.id, user.businessId) });
}));

export default router;
