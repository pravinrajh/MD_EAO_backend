import { Router } from "express";
import { salesActivityController } from "../controllers/salesActivity.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createSalesActivitySchema,
  listSalesActivitiesQuerySchema,
  updateSalesActivitySchema,
  updateSalesActivityStatusSchema,
} from "../validations/crm.validation";

const router = Router();

router.use(authenticate);

router.get("/", validate(listSalesActivitiesQuerySchema, "query"), salesActivityController.list);
router.post("/", validate(createSalesActivitySchema), salesActivityController.create);

router.patch(
  "/:id/status",
  validateObjectIdParam,
  validate(updateSalesActivityStatusSchema),
  salesActivityController.updateStatus,
);
router.get("/:id", validateObjectIdParam, salesActivityController.getById);
router.patch("/:id", validateObjectIdParam, validate(updateSalesActivitySchema), salesActivityController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, salesActivityController.remove);

export default router;
