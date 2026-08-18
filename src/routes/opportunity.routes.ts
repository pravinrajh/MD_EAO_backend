import { Router } from "express";
import { opportunityController } from "../controllers/opportunity.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createOpportunitySchema,
  listOpportunitiesQuerySchema,
  updateOpportunitySchema,
  updateOpportunityStageSchema,
} from "../validations/crm.validation";

const router = Router();

router.use(authenticate);

router.get("/pipeline", opportunityController.pipeline);
router.get("/forecast", opportunityController.forecast);
router.get("/", validate(listOpportunitiesQuerySchema, "query"), opportunityController.list);
router.post(
  "/",
  authorize("MD", "ADMIN", "MANAGER"),
  validate(createOpportunitySchema),
  opportunityController.create,
);

router.patch(
  "/:id/stage",
  validateObjectIdParam,
  validate(updateOpportunityStageSchema),
  opportunityController.updateStage,
);
router.get("/:id", validateObjectIdParam, opportunityController.getById);
router.patch("/:id", validateObjectIdParam, validate(updateOpportunitySchema), opportunityController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, opportunityController.remove);

export default router;
