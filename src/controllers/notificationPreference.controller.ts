import type { Request, Response } from "express";
import { notificationPreferenceService } from "../services/notificationPreference.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const notificationPreferenceController = {
  getPreferences: asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationPreferenceService.getPreferences(actor(req));
    return sendSuccess({ res, message: "Notification preferences fetched successfully", data });
  }),

  updatePreferences: asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationPreferenceService.updatePreferences(req.body, actor(req));
    return sendSuccess({ res, message: "Notification preferences updated successfully", data });
  }),
};
