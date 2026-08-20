import type { Request, Response } from "express";
import { reminderService } from "../services/reminder.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const reminderController = {
  createReminder: asyncHandler(async (req: Request, res: Response) => {
    const data = await reminderService.createReminder(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Reminder created successfully", data });
  }),

  getReminders: asyncHandler(async (req: Request, res: Response) => {
    const result = await reminderService.getReminders(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Reminders fetched successfully", data: result.items, meta: result.meta });
  }),

  getTodayReminders: asyncHandler(async (req: Request, res: Response) => {
    const result = await reminderService.getTodayReminders(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Today's reminders fetched successfully", data: result.items, meta: result.meta });
  }),

  getUpcomingReminders: asyncHandler(async (req: Request, res: Response) => {
    const result = await reminderService.getUpcomingReminders(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({
      res,
      message: "Upcoming reminders fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  getReminder: asyncHandler(async (req: Request, res: Response) => {
    const data = await reminderService.getReminder(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Reminder fetched successfully", data });
  }),

  updateReminder: asyncHandler(async (req: Request, res: Response) => {
    const data = await reminderService.updateReminder(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Reminder updated successfully", data });
  }),

  completeReminder: asyncHandler(async (req: Request, res: Response) => {
    const data = await reminderService.completeReminder(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Reminder completed successfully", data });
  }),

  cancelReminder: asyncHandler(async (req: Request, res: Response) => {
    const data = await reminderService.cancelReminder(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Reminder cancelled successfully", data });
  }),

  snoozeReminder: asyncHandler(async (req: Request, res: Response) => {
    const data = await reminderService.snoozeReminder(String(req.params.id), req.body.scheduledAt, actor(req));
    return sendSuccess({ res, message: "Reminder snoozed successfully", data });
  }),
};
