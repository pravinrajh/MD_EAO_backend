import { Router } from "express";
import { vendorController } from "../controllers/vendor.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import { createVendorSchema, listVendorsQuerySchema, updateVendorSchema } from "../validations/office.validation";

const router = Router();
router.use(authenticate);

router.get("/", validate(listVendorsQuerySchema, "query"), vendorController.list);
router.post("/", authorize("MD", "ADMIN", "MANAGER"), validate(createVendorSchema), vendorController.create);
router.get("/:id", validateObjectIdParam, vendorController.getById);
router.patch("/:id", authorize("MD", "ADMIN", "MANAGER"), validateObjectIdParam, validate(updateVendorSchema), vendorController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, vendorController.remove);

export default router;
