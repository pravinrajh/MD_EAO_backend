import rateLimit from "express-rate-limit";
import { isTest } from "../config/env";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
    errors: [],
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
    errors: [],
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: (req) => isTest || req.originalUrl.includes("/webhooks/whatsapp") || req.originalUrl.startsWith("/api-docs"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
    errors: [],
  },
});

export const assistantActionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many assistant actions. Please try again later.",
    errors: [],
  },
});

export const assistantQueryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many assistant queries. Please try again later.",
    errors: [],
  },
});

export const whatsappWebhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many webhook requests. Please try again later.",
    errors: [],
  },
});

export const whatsappLinkRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many WhatsApp linking attempts. Please try again later.",
    errors: [],
  },
});
