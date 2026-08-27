import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";

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

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.FRONTEND_URL,
    methods: ["GET", "POST", "PATCH"]
  }
});

app.set("io", io);

app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: false
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/", (_req, res) => {
  res.json({
    service: "Smart Interaction Platform",
    version: "1.0.0",
    status: "ready"
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/business", businessRouter);
app.use("/api/products", productsRouter);
app.use("/api/endpoints", endpointsRouter);
app.use("/api/public", publicRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/integrations", integrationsRouter);

io.on("connection", socket => {
  socket.on("session:join", ({ sessionId }) => {
    if (typeof sessionId === "string" && sessionId.length > 0) {
      socket.join(`session:${sessionId}`);
    }
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);

  const status = err.status || (err.name === "ZodError" ? 400 : 500);
  const message = err.name === "ZodError"
    ? "Invalid request data"
    : (env.NODE_ENV === "production" && status === 500 ? "Internal server error" : err.message);

  res.status(status).json({ error: message });
});

const server = httpServer.listen(env.PORT, () => {
  console.log(`Backend running on port ${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
