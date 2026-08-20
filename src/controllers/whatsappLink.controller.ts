import type { Request, Response } from "express";
import { whatsAppIdentityService } from "../services/whatsapp/whatsappIdentity.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const whatsAppLinkController = {
  createLinkCode: asyncHandler(async (req: Request, res: Response) => {
    const data = await whatsAppIdentityService.createLinkCode(actor(req));
    return sendSuccess({ res, statusCode: 201, message: "WhatsApp link code created", data });
  }),

  cancelLinkCode: asyncHandler(async (req: Request, res: Response) => {
    const data = await whatsAppIdentityService.cancelLinkCode(actor(req));
    return sendSuccess({ res, message: "WhatsApp link code cancelled", data });
  }),
};
