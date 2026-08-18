import { Router } from "express";
import { projectController } from "../controllers/project.controller";
import { meetingController } from "../controllers/meeting.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import { listTasksQuerySchema } from "../validations/task.validation";
import { listMeetingsQuerySchema } from "../validations/meeting.validation";
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectManagerSchema,
  updateProjectMembersSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from "../validations/project.validation";

const router = Router();

router.use(authenticate);

router.get("/", validate(listProjectsQuerySchema, "query"), projectController.list);
router.post("/", authorize("MD", "ADMIN"), validate(createProjectSchema), projectController.create);

router.get(
  "/:id/tasks/summary",
  validateObjectIdParam,
  projectController.taskSummary,
);
router.get(
  "/:id/tasks",
  validateObjectIdParam,
  validate(listTasksQuerySchema, "query"),
  projectController.listTasks,
);
router.get("/:id/summary", validateObjectIdParam, projectController.summary);
router.get(
  "/:id/meetings",
  validateObjectIdParam,
  validate(listMeetingsQuerySchema, "query"),
  meetingController.listForProject,
);
router.patch(
  "/:id/status",
  authorize("MD", "ADMIN", "MANAGER"),
  validateObjectIdParam,
  validate(updateProjectStatusSchema),
  projectController.updateStatus,
);
router.patch(
  "/:id/manager",
  authorize("MD", "ADMIN"),
  validateObjectIdParam,
  validate(updateProjectManagerSchema),
  projectController.updateManager,
);
router.patch(
  "/:id/members",
  authorize("MD", "ADMIN", "MANAGER"),
  validateObjectIdParam,
  validate(updateProjectMembersSchema),
  projectController.updateMembers,
);
router.get("/:id", validateObjectIdParam, projectController.getById);
router.patch(
  "/:id",
  authorize("MD", "ADMIN", "MANAGER"),
  validateObjectIdParam,
  validate(updateProjectSchema),
  projectController.update,
);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, projectController.remove);

export default router;
