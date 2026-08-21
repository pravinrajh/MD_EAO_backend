import { Router } from "express";
import { invoiceController } from "../controllers/invoice.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  recordInvoicePaymentSchema,
  updateInvoiceSchema,
} from "../validations/office.validation";

const router = Router();
router.use(authenticate);

router.get("/", validate(listInvoicesQuerySchema, "query"), invoiceController.list);
router.post("/", authorize("MD", "ADMIN", "MANAGER"), validate(createInvoiceSchema), invoiceController.create);
router.post(
  "/:id/payments",
  authorize("MD", "ADMIN", "MANAGER"),
  validateObjectIdParam,
  validate(recordInvoicePaymentSchema),
  invoiceController.recordPayment,
);
router.get("/:id", validateObjectIdParam, invoiceController.getById);
router.patch("/:id", authorize("MD", "ADMIN", "MANAGER"), validateObjectIdParam, validate(updateInvoiceSchema), invoiceController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, invoiceController.remove);

export default router;
