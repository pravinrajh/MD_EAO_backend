import { Router } from "express";
import { assistantController } from "../controllers/assistant.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { assistantActionRateLimiter, assistantQueryRateLimiter } from "../middlewares/rateLimit.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  assistantHistoryQuerySchema,
  importMeetingMinutesSchema,
  queryAssistantSchema,
} from "../validations/assistant.validation";

const router = Router();

router.use(authenticate);

router.post(
  "/query",
  assistantQueryRateLimiter,
  validate(queryAssistantSchema),
  assistantController.queryAssistant,
);

router.post("/chat", assistantQueryRateLimiter, validate(queryAssistantSchema), assistantController.chat);

router.post(
  "/import-minutes",
  assistantActionRateLimiter,
  validate(importMeetingMinutesSchema),
  assistantController.importMeetingMinutes,
);

router.get("/history", validate(assistantHistoryQuerySchema, "query"), assistantController.getAssistantHistory);

export default router;
