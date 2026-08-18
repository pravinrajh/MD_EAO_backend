import type { Request, Response } from "express";
import { meetingService } from "../services/meeting.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const meetingController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await meetingService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Meetings fetched successfully", data: result.items, meta: result.meta });
  }),

  today: asyncHandler(async (req: Request, res: Response) => {
    const result = await meetingService.today(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Today's meetings fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  upcoming: asyncHandler(async (req: Request, res: Response) => {
    const result = await meetingService.upcoming(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Upcoming meetings fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  myMeetings: asyncHandler(async (req: Request, res: Response) => {
    const result = await meetingService.myMeetings(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "My meetings fetched successfully", data: result.items, meta: result.meta });
  }),

  calendar: asyncHandler(async (req: Request, res: Response) => {
    const data = await meetingService.calendar(req.query as unknown as { from: Date; to: Date }, actor(req));
    return sendSuccess({ res, message: "Calendar meetings fetched successfully", data });
  }),

  counts: asyncHandler(async (req: Request, res: Response) => {
    const data = await meetingService.counts(actor(req));
    return sendSuccess({ res, message: "Meeting counts fetched successfully", data });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Meeting fetched successfully", data: meeting });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Meeting created successfully", data: meeting });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Meeting updated successfully", data: meeting });
  }),

  reschedule: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingService.reschedule(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Meeting rescheduled successfully", data: meeting });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingService.updateStatus(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Meeting status updated successfully", data: meeting });
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingService.cancel(String(req.params.id), req.body.reason, actor(req));
    return sendSuccess({ res, message: "Meeting cancelled successfully", data: meeting });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Meeting deleted successfully", data: meeting });
  }),

  listForProject: asyncHandler(async (req: Request, res: Response) => {
    const result = await meetingService.listForProject(
      String(req.params.id),
      req.query as Record<string, unknown>,
      actor(req),
    );
    return sendSuccess({ res, message: "Project meetings fetched successfully", data: result.items, meta: result.meta });
  }),
};
