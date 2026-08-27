import express from "express";
import { prisma } from "../config/prisma.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  let database = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    database = "error";
  }

  res.json({
    success: database === "ok",
    service: "smart-interaction-platform-backend",
    version: "1.0.0",
    database
  });
});

export default router;
