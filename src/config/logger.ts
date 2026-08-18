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
