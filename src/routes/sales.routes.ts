import { Router } from "express";
import { salesController } from "../controllers/sales.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validation.middleware";
import { listFollowUpsQuerySchema, listMySalesQuerySchema } from "../validations/crm.validation";

const router = Router();

router.use(authenticate);

router.get("/summary", salesController.summary);
router.get("/my", validate(listMySalesQuerySchema, "query"), salesController.mySales);
router.get("/follow-ups", validate(listFollowUpsQuerySchema, "query"), salesController.followUps);

export default router;
