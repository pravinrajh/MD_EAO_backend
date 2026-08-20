import pino from "pino";
import { env, isProduction } from "./env";

const redactPaths = [
  "password",
  "passwordHash",
  "JWT_SECRET",
  "jwt",
  "token",
  "authorization",
  "headers.authorization",
  "MAYTAPI_TOKEN",
  "MAYTAPI_WEBHOOK_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "access_token",
  "appSecret",
  "verifyToken",
  "req.headers.authorization",
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
});
