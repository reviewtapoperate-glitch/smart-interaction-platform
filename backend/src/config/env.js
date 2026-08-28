import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PLATFORM_ADMIN_KEY: z.string().min(32),
  PUBLIC_BASE_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  MPESA_CONSUMER_KEY: z.string().optional().default(""),
  MPESA_CONSUMER_SECRET: z.string().optional().default(""),
  MPESA_SHORT_CODE: z.string().optional().default(""),
  MPESA_PASSKEY: z.string().optional().default(""),
  MPESA_CALLBACK_URL: z.string().url().optional().default("http://localhost:4000/api/payments/mpesa/callback")
});

export const env = schema.parse(process.env);
