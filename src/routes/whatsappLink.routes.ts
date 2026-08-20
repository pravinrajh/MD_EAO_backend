import { Router } from "express";
import { whatsAppLinkController } from "../controllers/whatsappLink.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { whatsappLinkRateLimiter } from "../middlewares/rateLimit.middleware";

const router = Router();

router.use(authenticate);
router.post("/link-code", whatsappLinkRateLimiter, whatsAppLinkController.createLinkCode);
router.delete("/link-code", whatsAppLinkController.cancelLinkCode);

export default router;
