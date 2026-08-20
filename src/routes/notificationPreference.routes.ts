import { Router } from "express";
import { notificationPreferenceController } from "../controllers/notificationPreference.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validation.middleware";
import { updateNotificationPreferenceSchema } from "../validations/notificationPreference.validation";

const router = Router();

router.use(authenticate);

router.get("/", notificationPreferenceController.getPreferences);
router.patch("/", validate(updateNotificationPreferenceSchema), notificationPreferenceController.updatePreferences);

export default router;
