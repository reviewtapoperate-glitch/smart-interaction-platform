import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { ensurePlatformTables } from "./services/platform.js";
import { API_ROOT } from "../../contract/api-contract.js";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import businessRouter from "./routes/business.js";
import productsRouter from "./routes/products.js";
import endpointsRouter from "./routes/endpoints.js";
import publicRouter from "./routes/public.js";
import paymentsRouter from "./routes/payments.js";
import analyticsRouter from "./routes/analytics.js";
import eventsRouter from "./routes/events.js";
import integrationsRouter from "./routes/integrations.js";
import onboardingRouter from "./routes/onboarding.js";
import adminRouter from "./routes/admin.js";

const app = express();
const httpServer = createServer(app);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(dirname, "../../frontend/public");
const contractFile = path.resolve(dirname, "../../contract/api-contract.js");
const io = new Server(httpServer, { cors: { origin: env.FRONTEND_URL, methods: ["GET", "POST", "PATCH", "PUT"] } });
app.set("io", io);
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: false }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.get("/api-contract.js", (_req, res) => res.sendFile(contractFile));
app.get("/favicon.ico", (_req, res) => res.redirect(302, "/favicon.svg"));
app.get(`${API_ROOT}`, (_req, res) => res.json({ service: "ReviewTap", version: "1.2.0", status: "ready" }));
app.use(`${API_ROOT}/health`, healthRouter);
app.use(`${API_ROOT}/auth`, authRouter);
app.use(`${API_ROOT}/business`, businessRouter);
app.use(`${API_ROOT}/products`, productsRouter);
app.use(`${API_ROOT}/endpoints`, endpointsRouter);
app.use(`${API_ROOT}/public`, publicRouter);
app.use(`${API_ROOT}/payments`, paymentsRouter);
app.use(`${API_ROOT}/analytics`, analyticsRouter);
app.use(`${API_ROOT}/events`, eventsRouter);
app.use(`${API_ROOT}/integrations`, integrationsRouter);
app.use(`${API_ROOT}/onboarding`, onboardingRouter);
app.use(`${API_ROOT}/_platform-admin`, adminRouter);
io.on("connection", socket => {
  socket.on("session:join", ({ sessionId }) => {
    if (typeof sessionId === "string" && sessionId.length > 0) socket.join(`session:${sessionId}`);
  });
});
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.name === "ZodError" ? 400 : 500);
  const message = err.name === "ZodError" ? "Invalid request data" : (env.NODE_ENV === "production" && status === 500 ? "Internal server error" : err.message);
  res.status(status).json({ error: message });
});
app.use(express.static(frontendDir, { index: false }));
app.get("/", (_req, res) => res.sendFile(path.join(frontendDir, "index.html")));
app.get("/e/:token", (_req, res) => res.sendFile(path.join(frontendDir, "endpoint.html")));
app.get("/s/:token", (_req, res) => res.sendFile(path.join(frontendDir, "session.html")));
app.get("/app.html", (_req, res) => res.sendFile(path.join(frontendDir, "app.html")));
app.get("/_rt-admin", (_req, res) => res.sendFile(path.join(frontendDir, "admin.html")));

async function start() {
  await ensurePlatformTables();
  const server = httpServer.listen(env.PORT, () => console.log(`Backend running on port ${env.PORT}`));
  async function shutdown(signal) {
    console.log(`Received ${signal}; shutting down`);
    server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
start().catch(error => { console.error("Startup failed", error); process.exit(1); });
