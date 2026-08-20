import type { Request, Response } from "express";
import { isTest } from "../config/env";
import { whatsAppWebhookService } from "../services/whatsapp/whatsappWebhook.service";
import { processWhatsAppQueue } from "../workers/whatsapp.worker";
import { asyncHandler } from "../utils/asyncHandler";

function hubQueryFromRequest(req: Request): Record<string, unknown> {
  const search = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?") + 1) : "";
  const params = new URLSearchParams(search);
  return {
    "hub.mode": params.get("hub.mode") ?? "",
    "hub.verify_token": params.get("hub.verify_token") ?? "",
    "hub.challenge": params.get("hub.challenge") ?? "",
    hub: {
      mode: params.get("hub.mode") ?? "",
      verify_token: params.get("hub.verify_token") ?? "",
      token: params.get("hub.verify_token") ?? "",
      challenge: params.get("hub.challenge") ?? "",
    },
  };
}

export const whatsAppWebhookController = {
  verifyWebhook: asyncHandler(async (req: Request, res: Response) => {
    const challenge = whatsAppWebhookService.verifyWebhook(hubQueryFromRequest(req));
    if (challenge === null) {
      return res.status(403).type("text/plain").send("Forbidden");
    }
    return res.status(200).type("text/plain").send(challenge);
  }),

  receiveWebhook: asyncHandler(async (req: Request, res: Response) => {
    const signature = String(req.headers["x-hub-signature-256"] ?? "");
    whatsAppWebhookService.assertSignature(req.rawBody, signature);
    await whatsAppWebhookService.receiveWebhook(req.body);
    res.status(200).json({ success: true });
    if (!isTest) void processWhatsAppQueue();
  }),
};
