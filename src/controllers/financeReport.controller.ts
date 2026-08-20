import type { Request, Response } from "express";
import { financeReportService } from "../services/financeReport.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const financeReportController = {
  summary: asyncHandler(async (req: Request, res: Response) => {
    const data = await financeReportService.summary(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Finance summary fetched successfully", data });
  }),

  monthly: asyncHandler(async (req: Request, res: Response) => {
    const data = await financeReportService.monthly(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Monthly report fetched successfully", data });
  }),

  expensesByCategory: asyncHandler(async (req: Request, res: Response) => {
    const data = await financeReportService.expensesByCategory(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Expense report fetched successfully", data });
  }),

  projectSummary: asyncHandler(async (req: Request, res: Response) => {
    const data = await financeReportService.projectSummary(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Project finance summary fetched successfully", data });
  }),

  customerSummary: asyncHandler(async (req: Request, res: Response) => {
    const data = await financeReportService.customerSummary(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Customer finance summary fetched successfully", data });
  }),
};
