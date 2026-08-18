import { Router } from "express";
import { customerController } from "../controllers/customer.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
  updateCustomerStatusSchema,
} from "../validations/crm.validation";

const router = Router();

router.use(authenticate);

router.get("/", validate(listCustomersQuerySchema, "query"), customerController.list);
router.post("/", authorize("MD", "ADMIN", "MANAGER"), validate(createCustomerSchema), customerController.create);

router.patch(
  "/:id/status",
  validateObjectIdParam,
  validate(updateCustomerStatusSchema),
  customerController.updateStatus,
);
router.get("/:id", validateObjectIdParam, customerController.getById);
router.patch("/:id", validateObjectIdParam, validate(updateCustomerSchema), customerController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, customerController.remove);

export default router;
