import { Router } from "express";
import { whatsAppWebhookController } from "../controllers/whatsappWebhook.controller";
import { whatsappWebhookRateLimiter } from "../middlewares/rateLimit.middleware";

const router = Router();

router.get("/", whatsAppWebhookController.verifyWebhook);
router.post("/", whatsappWebhookRateLimiter, whatsAppWebhookController.receiveWebhook);

export default router;
