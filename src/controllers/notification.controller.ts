import type { Request, Response } from "express";
import { notificationService } from "../services/notification.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const notificationController = {
  getNotifications: asyncHandler(async (req: Request, res: Response) => {
    const result = await notificationService.getNotifications(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({
      res,
      message: "Notifications fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  getNotification: asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.getNotification(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Notification fetched successfully", data });
  }),

  markAsRead: asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.markAsRead(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Notification marked as read", data });
  }),

  markAsUnread: asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.markAsUnread(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Notification marked as unread", data });
  }),

  markAllAsRead: asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.markAllAsRead(actor(req));
    return sendSuccess({ res, message: "Notifications marked as read", data });
  }),

  getUnreadCount: asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.getUnreadCount(actor(req));
    return sendSuccess({ res, message: "Unread count fetched successfully", data });
  }),

  deleteNotification: asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.deleteNotification(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Notification deleted successfully", data });
  }),
};
