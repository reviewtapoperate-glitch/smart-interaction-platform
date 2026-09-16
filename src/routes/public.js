import express from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { randomToken } from "../utils/tokens.js";
import { asyncRoute } from "../utils/http.js";
import { recordEvent } from "../services/analytics.js";
import { getSessionBill } from "../services/billing.js";

const router = express.Router();
const endpointActions = ["REVIEW_CLICKED","WHATSAPP_CLICKED","WEBSITE_CLICKED","SOCIAL_CLICKED","DIRECTIONS_CLICKED","SAVE_CONTACT_CLICKED","SHARE_CLICKED","PAYMENT_COPIED","MENU_OPENED","GALLERY_OPENED"];

async function loadProfileEndpoint(linkId) {
  const endpoint = await prisma.endpoint.findUnique({ where: { publicToken: linkId }, include: { business: true, branch: true } });
  if (endpoint?.status === "ACTIVE") return endpoint;
  const endpoints = await prisma.endpoint.findMany({ where: { status: "ACTIVE" }, include: { business: true, branch: true }, take: 100 });
  return endpoints.find(item => (item.actionProfile?.linkId || item.code) === linkId) || null;
}

function profileResponse(endpoint) {
  return { endpoint: { id: endpoint.id, name: endpoint.name, type: endpoint.type, actionProfile: endpoint.actionProfile || {}, branch: endpoint.branch?.name || null, publicToken: endpoint.publicToken }, business: { id: endpoint.business.id, name: endpoint.business.name, currency: endpoint.business.currency, timezone: endpoint.business.timezone, websiteUrl: endpoint.business.websiteUrl, googleBusinessUrl: endpoint.business.googleBusinessUrl, logoUrl: endpoint.business.logoUrl } };
}

router.get("/search", asyncRoute(async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const type = String(req.query.type || "").trim().toUpperCase();
  const rows = await prisma.endpoint.findMany({ where: { status: "ACTIVE" }, include: { business: true, branch: true }, orderBy: { createdAt: "desc" }, take: 100 });
  const results = rows.filter(e => {
    const p = e.actionProfile || {}, menu = Array.isArray(p.menu) ? p.menu : [];
    if (type && String(p.profileType || e.type).toUpperCase() !== type) return false;
    if (!q) return true;
    return [e.name, e.business.name, p.fullName, p.title, p.profileType, p.address, ...menu.flatMap(i => [i.name, i.category, i.description])].some(v => String(v || "").toLowerCase().includes(q));
  }).slice(0, 30).map(e => ({ id: e.id, name: e.actionProfile?.fullName || e.business.name || e.name, title: e.actionProfile?.title || "", type: e.actionProfile?.profileType || e.type, linkId: e.actionProfile?.linkId || e.code, publicToken: e.publicToken, businessName: e.business.name, address: e.actionProfile?.address || e.branch?.address || "", menu: Array.isArray(e.actionProfile?.menu) ? e.actionProfile.menu.map(i => i.name).slice(0, 8) : [] }));
  res.json({ results });
}));

router.get("/compare", asyncRoute(async (req, res) => {
  const ids = String(req.query.ids || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 3);
  if (ids.length !== 3) return res.status(400).json({ error: "Choose exactly 3 profiles to compare" });
  const rows = await prisma.endpoint.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, include: { business: true, branch: true } });
  const byId = new Map(rows.map(e => [e.id, e]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean);
  if (ordered.length !== 3) return res.status(404).json({ error: "One or more profiles were not found" });
  res.json({ results: ordered.map(e => ({ id: e.id, ...profileResponse(e) })) });
}));

router.get("/profile/:linkId", asyncRoute(async (req, res) => {
  const linkId = String(req.params.linkId || "").trim();
  if (!/^[A-Za-z0-9-]{1,80}$/.test(linkId)) return res.status(400).json({ error: "Invalid Link ID" });
  const endpoint = await loadProfileEndpoint(linkId);
  if (!endpoint) return res.status(404).json({ error: "ReviewTap page not found" });
  await recordEvent({ businessId: endpoint.businessId, endpointId: endpoint.id, eventName: "PROFILE_OPENED" });
  res.json(profileResponse(endpoint));
}));

router.get("/endpoint/:token", asyncRoute(async (req, res) => {
  const endpoint = await prisma.endpoint.findUnique({ where: { publicToken: req.params.token }, include: { business: true, branch: true } });
  if (!endpoint || endpoint.status !== "ACTIVE") return res.status(404).json({ error: "Endpoint not found or inactive" });
  const activeSession = await prisma.session.findFirst({ where: { endpointId: endpoint.id, status: "ACTIVE" }, orderBy: { startedAt: "desc" } });
  await recordEvent({ businessId: endpoint.businessId, endpointId: endpoint.id, sessionId: activeSession?.id, eventName: "ENDPOINT_OPENED", metadata: { method: req.headers["user-agent"] || "unknown" } });
  res.json({ ...profileResponse(endpoint), activeSession: activeSession ? { id: activeSession.id, status: activeSession.status } : null });
}));

router.post("/endpoint/:token/actions", asyncRoute(async (req, res) => {
  const data = z.object({ action: z.enum(endpointActions) }).strict().parse(req.body);
  const endpoint = await prisma.endpoint.findUnique({ where: { publicToken: req.params.token } });
  if (!endpoint || endpoint.status !== "ACTIVE") return res.status(404).json({ error: "Endpoint not found or inactive" });
  await recordEvent({ businessId: endpoint.businessId, endpointId: endpoint.id, eventName: data.action });
  res.status(201).json({ recorded: true });
}));

router.post("/endpoint/:token/session", asyncRoute(async (req, res) => {
  const endpoint = await prisma.endpoint.findUnique({ where: { publicToken: req.params.token } });
  if (!endpoint || endpoint.status !== "ACTIVE") return res.status(404).json({ error: "Endpoint not found or inactive" });
  const existing = await prisma.session.findFirst({ where: { endpointId: endpoint.id, status: "ACTIVE" }, orderBy: { startedAt: "desc" } });
  if (existing) return res.json({ session: existing, existing: true });
  const data = z.object({ guestName: z.string().max(120).optional(), guestPhone: z.string().max(40).optional() }).parse(req.body || {});
  const session = await prisma.session.create({ data: { businessId: endpoint.businessId, branchId: endpoint.branchId, endpointId: endpoint.id, publicToken: randomToken(18), guestName: data.guestName, guestPhone: data.guestPhone } });
  await recordEvent({ businessId: endpoint.businessId, endpointId: endpoint.id, sessionId: session.id, eventName: "SESSION_STARTED" });
  req.app.get("io").to(`session:${session.id}`).emit("order:created", { sessionId: session.id });
  res.status(201).json({ session, existing: false });
}));

router.get("/session/:token", asyncRoute(async (req, res) => {
  const session = await prisma.session.findUnique({ where: { publicToken: req.params.token }, include: { business: true, endpoint: true, orders: { where: { status: { not: "CANCELLED" } }, include: { items: true, staff: { select: { name: true } } }, orderBy: { createdAt: "asc" } } } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  const bill = await getSessionBill(session.id);
  res.json({ session: { id: session.id, token: session.publicToken, status: session.status, endpoint: session.endpoint.name }, business: { name: session.business.name, currency: session.business.currency }, orders: session.orders, bill });
}));
router.get("/session/:token/products", asyncRoute(async (req, res) => { const session = await prisma.session.findUnique({ where: { publicToken: req.params.token } }); if (!session) return res.status(404).json({ error: "Session not found" }); res.json(await prisma.product.findMany({ where: { businessId: session.businessId, active: true }, orderBy: { name: "asc" } })); }));
router.post("/session/:token/orders", asyncRoute(async (req, res) => {
  const session = await prisma.session.findUnique({ where: { publicToken: req.params.token } }); if (!session || session.status !== "ACTIVE") return res.status(409).json({ error: "Session is not active" });
  const data = z.object({ items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive().max(100) })).min(1), notes: z.string().max(500).optional() }).parse(req.body);
  const products = await prisma.product.findMany({ where: { businessId: session.businessId, id: { in: data.items.map(i => i.productId) }, active: true } }); const byId = new Map(products.map(p => [p.id, p]));
  for (const item of data.items) if (!byId.has(item.productId)) return res.status(400).json({ error: `Invalid product: ${item.productId}` });
  const order = await prisma.order.create({ data: { businessId: session.businessId, branchId: session.branchId, sessionId: session.id, notes: data.notes, status: "SUBMITTED", items: { create: data.items.map(item => { const product = byId.get(item.productId); return { productId: product.id, quantity: item.quantity, unitPriceMinor: product.priceMinor, nameSnapshot: product.name }; }) } }, include: { items: true } });
  await recordEvent({ businessId: session.businessId, endpointId: session.endpointId, sessionId: session.id, eventName: "ORDER_CREATED", metadata: { orderId: order.id } }); req.app.get("io").to(`session:${session.id}`).emit("order:created", order); res.status(201).json(order);
}));
export default router;
