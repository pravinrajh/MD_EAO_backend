import { Router } from "express";
import { leadController } from "../controllers/lead.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  convertLeadSchema,
  createLeadSchema,
  listLeadsQuerySchema,
  updateLeadFollowUpSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
} from "../validations/crm.validation";

const router = Router();

router.use(authenticate);

router.get("/", validate(listLeadsQuerySchema, "query"), leadController.list);
router.post("/", validate(createLeadSchema), leadController.create);

router.patch(
  "/:id/status",
  validateObjectIdParam,
  validate(updateLeadStatusSchema),
  leadController.updateStatus,
);
router.patch(
  "/:id/follow-up",
  validateObjectIdParam,
  validate(updateLeadFollowUpSchema),
  leadController.updateFollowUp,
);
router.post("/:id/convert", validateObjectIdParam, validate(convertLeadSchema), leadController.convert);
router.get("/:id", validateObjectIdParam, leadController.getById);
router.patch("/:id", validateObjectIdParam, validate(updateLeadSchema), leadController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, leadController.remove);

export default router;
