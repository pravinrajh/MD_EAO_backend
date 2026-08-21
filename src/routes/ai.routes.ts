import { Router } from "express";
import { aiController } from "../controllers/ai.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { assistantActionRateLimiter, assistantQueryRateLimiter } from "../middlewares/rateLimit.middleware";
import { validate } from "../middlewares/validation.middleware";
import { processActionSchema } from "../validations/assistantAction.validation";
import { queryAssistantSchema } from "../validations/assistant.validation";

const router = Router();

router.use(authenticate);

router.post("/query", assistantQueryRateLimiter, validate(queryAssistantSchema), aiController.query);
router.post("/action", assistantActionRateLimiter, validate(processActionSchema), aiController.action);
router.post("/chat", assistantQueryRateLimiter, validate(queryAssistantSchema), aiController.chat);

export default router;
