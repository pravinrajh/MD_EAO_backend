import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5050),
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
  WHATSAPP_PROVIDER: z.string().optional().default("meta"),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default("whatsapp-verify-dev"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_APP_SECRET: z.string().optional().default("whatsapp-secret-dev"),
  WHATSAPP_API_VERSION: z.string().optional().default("v21.0"),
  WHATSAPP_MESSAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WHATSAPP_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  WHATSAPP_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(2_000),
  WHATSAPP_LINK_CODE_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  SWAGGER_ENABLED: z.enum(["true", "false"]).optional(),
  SWAGGER_SERVER_URL: z.string().trim().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-2.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().max(20_000).default(8_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export function isSwaggerEnabled(): boolean {
  if (env.SWAGGER_ENABLED === "true") return true;
  if (env.SWAGGER_ENABLED === "false") return false;
  return !isProduction;
}

export function swaggerServerUrl(): string {
  if (env.SWAGGER_SERVER_URL) return env.SWAGGER_SERVER_URL.replace(/\/$/, "");
  return `http://localhost:${env.PORT}`;
}
