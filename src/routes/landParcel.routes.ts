import { Router } from "express";
import { landParcelController } from "../controllers/landParcel.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import { createLandParcelSchema, listLandParcelsQuerySchema, updateLandParcelSchema } from "../validations/office.validation";

const router = Router();
router.use(authenticate);

router.get("/", validate(listLandParcelsQuerySchema, "query"), landParcelController.list);
router.post("/", authorize("MD", "ADMIN", "MANAGER"), validate(createLandParcelSchema), landParcelController.create);
router.get("/:id", validateObjectIdParam, landParcelController.getById);
router.patch("/:id", authorize("MD", "ADMIN", "MANAGER"), validateObjectIdParam, validate(updateLandParcelSchema), landParcelController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, landParcelController.remove);

export default router;
