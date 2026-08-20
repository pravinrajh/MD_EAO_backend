import { Router } from "express";
import { reminderController } from "../controllers/reminder.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createReminderSchema,
  listRemindersQuerySchema,
  snoozeReminderSchema,
  upcomingRemindersQuerySchema,
  updateReminderSchema,
} from "../validations/reminder.validation";

const router = Router();

router.use(authenticate);

router.get("/today", validate(listRemindersQuerySchema, "query"), reminderController.getTodayReminders);
router.get("/upcoming", validate(upcomingRemindersQuerySchema, "query"), reminderController.getUpcomingReminders);
router.get("/", validate(listRemindersQuerySchema, "query"), reminderController.getReminders);
router.post("/", validate(createReminderSchema), reminderController.createReminder);
router.get("/:id", validateObjectIdParam, reminderController.getReminder);
router.patch("/:id", validateObjectIdParam, validate(updateReminderSchema), reminderController.updateReminder);
router.patch("/:id/complete", validateObjectIdParam, reminderController.completeReminder);
router.patch("/:id/cancel", validateObjectIdParam, reminderController.cancelReminder);
router.patch(
  "/:id/snooze",
  validateObjectIdParam,
  validate(snoozeReminderSchema),
  reminderController.snoozeReminder,
);

export default router;
