import type { Request, Response } from "express";
import { salesActivityService } from "../services/salesActivity.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const salesActivityController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await salesActivityService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Sales activities fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const activity = await salesActivityService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Sales activity fetched successfully", data: activity });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const activity = await salesActivityService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Sales activity created successfully", data: activity });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const activity = await salesActivityService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Sales activity updated successfully", data: activity });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const activity = await salesActivityService.updateStatus(String(req.params.id), req.body.status, actor(req));
    return sendSuccess({ res, message: "Sales activity status updated successfully", data: activity });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const activity = await salesActivityService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Sales activity deleted successfully", data: activity });
  }),
};
