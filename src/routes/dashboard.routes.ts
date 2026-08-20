import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  activityQuerySchema,
  dashboardQuerySchema,
  projectHealthQuerySchema,
  upcomingMeetingsQuerySchema,
} from "../validations/dashboard.validation";

const router = Router();

router.use(authenticate);

router.get("/", validate(dashboardQuerySchema, "query"), dashboardController.getDashboard);
router.get("/md", authorize("MD", "ADMIN"), validate(dashboardQuerySchema, "query"), dashboardController.getMDDashboard);
router.get("/me", validate(dashboardQuerySchema, "query"), dashboardController.getEmployeeDashboard);
router.get("/attention", validate(dashboardQuerySchema, "query"), dashboardController.getAttention);
router.get("/project-health", validate(projectHealthQuerySchema, "query"), dashboardController.getProjectHealth);
router.get(
  "/weekly-financial-requirement",
  authorize("MD", "ADMIN", "MANAGER"),
  validate(dashboardQuerySchema, "query"),
  dashboardController.getWeeklyFinancialRequirement,
);
router.get("/upcoming-meetings", validate(upcomingMeetingsQuerySchema, "query"), dashboardController.getUpcomingMeetings);
router.get("/activity", validate(activityQuerySchema, "query"), dashboardController.getActivity);
router.get("/morning-report", validate(dashboardQuerySchema, "query"), dashboardController.getMorningReport);

export default router;
