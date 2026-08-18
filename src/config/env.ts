import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/md_ai_office"),
  JWT_SECRET: z.string().min(16).default("change_this_secret_dev_only"),
  JWT_REFRESH_SECRET: z.string().min(16).default("change_this_refresh_secret_dev"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  APP_TIMEZONE: z.string().min(1).default("Asia/Kolkata"),
  MAYTAPI_TOKEN: z.string().optional().default(""),
  MAYTAPI_PRODUCT_ID: z.string().optional().default(""),
  MAYTAPI_PHONE_ID: z.string().optional().default(""),
  MAYTAPI_WEBHOOK_SECRET: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
