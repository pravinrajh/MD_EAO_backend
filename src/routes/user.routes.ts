import { Router } from "express";
import { userController } from "../controllers/user.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  updateUserStatusSchema,
} from "../validations/user.validation";

const router = Router();

router.use(authenticate);

router.get("/", authorize("MD", "ADMIN", "MANAGER"), validate(listUsersQuerySchema, "query"), userController.list);
router.post("/", authorize("MD", "ADMIN"), validate(createUserSchema), userController.create);
router.patch(
  "/:id/status",
  authorize("MD", "ADMIN"),
  validateObjectIdParam,
  validate(updateUserStatusSchema),
  userController.updateStatus,
);
router.get("/:id", authorize("MD", "ADMIN", "MANAGER"), validateObjectIdParam, userController.getById);
router.patch(
  "/:id",
  authorize("MD", "ADMIN"),
  validateObjectIdParam,
  validate(updateUserSchema),
  userController.update,
);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, userController.remove);

export default router;
