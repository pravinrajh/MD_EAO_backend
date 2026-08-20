import { Router } from "express";
import { assistantActionController } from "../controllers/assistantAction.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { assistantActionRateLimiter } from "../middlewares/rateLimit.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  actionHistoryQuerySchema,
  actionIdParamSchema,
  confirmActionSchema,
  processActionSchema,
} from "../validations/assistantAction.validation";

const router = Router();

router.use(authenticate);

router.post(
  "/action",
  assistantActionRateLimiter,
  validate(processActionSchema),
  assistantActionController.processAction,
);

router.post(
  "/action/:actionId/confirm",
  assistantActionRateLimiter,
  validate(actionIdParamSchema, "params"),
  validate(confirmActionSchema),
  assistantActionController.confirmAction,
);

router.get(
  "/actions/history",
  validate(actionHistoryQuerySchema, "query"),
  assistantActionController.getActionHistory,
);

export default router;
