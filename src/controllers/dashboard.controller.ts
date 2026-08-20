import type { Request, Response } from "express";
import { dashboardService } from "../services/dashboard.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const dashboardController = {
  getDashboard: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getDashboard(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Dashboard fetched successfully", data });
  }),

  getMDDashboard: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getMDDashboard(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Dashboard fetched successfully", data });
  }),

  getEmployeeDashboard: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getEmployeeDashboard(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Dashboard fetched successfully", data });
  }),

  getAttention: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getAttentionItems(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Attention items fetched successfully", data });
  }),

  getProjectHealth: asyncHandler(async (req: Request, res: Response) => {
    const result = await dashboardService.getProjectHealth(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({
      res,
      message: "Project health fetched successfully",
      data: result,
      meta: result.meta,
    });
  }),

  getWeeklyFinancialRequirement: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getWeeklyFinancialRequirement(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Weekly financial requirement fetched successfully", data });
  }),

  getUpcomingMeetings: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getUpcomingMeetings(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Upcoming meetings fetched successfully", data });
  }),

  getActivity: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getRecentActivity(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Activity fetched successfully", data });
  }),

  getMorningReport: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getMorningReport(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({ res, message: "Morning report fetched successfully", data });
  }),
};
