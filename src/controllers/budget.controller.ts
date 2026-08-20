import type { Request, Response } from "express";
import { budgetService } from "../services/budget.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const budgetController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await budgetService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Budgets fetched successfully", data: result.items, meta: result.meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const budget = await budgetService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Budget fetched successfully", data: budget });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const budget = await budgetService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Budget created successfully", data: budget });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const budget = await budgetService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Budget updated successfully", data: budget });
  }),

  summary: asyncHandler(async (req: Request, res: Response) => {
    const data = await budgetService.summary(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Budget summary fetched successfully", data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const budget = await budgetService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Budget deleted successfully", data: budget });
  }),
};
