import { Router } from "express";
import { taskController } from "../controllers/task.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createTaskSchema,
  listTasksQuerySchema,
  myTasksQuerySchema,
  updateTaskAssigneeSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from "../validations/task.validation";

const router = Router();

router.use(authenticate);

router.get("/my", validate(myTasksQuerySchema, "query"), taskController.myTasks);
router.get("/created-by-me", validate(listTasksQuerySchema, "query"), taskController.createdByMe);
router.get("/overdue", validate(listTasksQuerySchema, "query"), taskController.overdue);
router.get("/today", validate(myTasksQuerySchema, "query"), taskController.today);
router.get("/counts", taskController.counts);
router.get("/", validate(listTasksQuerySchema, "query"), taskController.list);
router.post("/", authorize("MD", "ADMIN", "MANAGER"), validate(createTaskSchema), taskController.create);

router.patch(
  "/:id/status",
  validateObjectIdParam,
  validate(updateTaskStatusSchema),
  taskController.updateStatus,
);
router.patch(
  "/:id/assignee",
  authorize("MD", "ADMIN", "MANAGER"),
  validateObjectIdParam,
  validate(updateTaskAssigneeSchema),
  taskController.assign,
);
router.get("/:id", validateObjectIdParam, taskController.getById);
router.patch("/:id", validateObjectIdParam, validate(updateTaskSchema), taskController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, taskController.remove);

export default router;
