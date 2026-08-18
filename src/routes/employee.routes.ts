import { Router } from "express";
import { employeeController } from "../controllers/employee.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
  updateEmployeeStatusSchema,
} from "../validations/employee.validation";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  authorize("MD", "ADMIN", "MANAGER"),
  validate(listEmployeesQuerySchema, "query"),
  employeeController.list,
);
router.post("/", authorize("MD", "ADMIN"), validate(createEmployeeSchema), employeeController.create);
router.patch(
  "/:id/status",
  authorize("MD", "ADMIN"),
  validateObjectIdParam,
  validate(updateEmployeeStatusSchema),
  employeeController.updateStatus,
);
router.get("/:id", authorize("MD", "ADMIN", "MANAGER"), validateObjectIdParam, employeeController.getById);
router.patch(
  "/:id",
  authorize("MD", "ADMIN"),
  validateObjectIdParam,
  validate(updateEmployeeSchema),
  employeeController.update,
);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, employeeController.remove);

export default router;
