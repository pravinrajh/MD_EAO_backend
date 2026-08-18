import { Router } from "express";
import { meetingController } from "../controllers/meeting.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  calendarQuerySchema,
  cancelMeetingSchema,
  createMeetingSchema,
  listMeetingsQuerySchema,
  rescheduleMeetingSchema,
  upcomingMeetingsQuerySchema,
  updateMeetingSchema,
  updateMeetingStatusSchema,
} from "../validations/meeting.validation";

const router = Router();

router.use(authenticate);

router.get("/today", validate(listMeetingsQuerySchema, "query"), meetingController.today);
router.get("/upcoming", validate(upcomingMeetingsQuerySchema, "query"), meetingController.upcoming);
router.get("/my", validate(listMeetingsQuerySchema, "query"), meetingController.myMeetings);
router.get("/calendar", validate(calendarQuerySchema, "query"), meetingController.calendar);
router.get("/counts", meetingController.counts);
router.get("/", validate(listMeetingsQuerySchema, "query"), meetingController.list);
router.post("/", authorize("MD", "ADMIN", "MANAGER"), validate(createMeetingSchema), meetingController.create);

router.patch(
  "/:id/status",
  validateObjectIdParam,
  validate(updateMeetingStatusSchema),
  meetingController.updateStatus,
);
router.patch(
  "/:id/reschedule",
  validateObjectIdParam,
  validate(rescheduleMeetingSchema),
  meetingController.reschedule,
);
router.patch("/:id/cancel", validateObjectIdParam, validate(cancelMeetingSchema), meetingController.cancel);
router.get("/:id", validateObjectIdParam, meetingController.getById);
router.patch("/:id", validateObjectIdParam, validate(updateMeetingSchema), meetingController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, meetingController.remove);

export default router;
