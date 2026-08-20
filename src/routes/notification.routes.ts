import { Router } from "express";
import { notificationController } from "../controllers/notification.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import { listNotificationsQuerySchema } from "../validations/notification.validation";

const router = Router();

router.use(authenticate);

router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllAsRead);
router.get("/", validate(listNotificationsQuerySchema, "query"), notificationController.getNotifications);
router.get("/:id", validateObjectIdParam, notificationController.getNotification);
router.patch("/:id/read", validateObjectIdParam, notificationController.markAsRead);
router.patch("/:id/unread", validateObjectIdParam, notificationController.markAsUnread);
router.delete("/:id", validateObjectIdParam, notificationController.deleteNotification);

export default router;
