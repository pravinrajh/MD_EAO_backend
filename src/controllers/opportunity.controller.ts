import type { Request, Response } from "express";
import { opportunityService } from "../services/opportunity.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const opportunityController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await opportunityService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Opportunities fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  pipeline: asyncHandler(async (req: Request, res: Response) => {
    const data = await opportunityService.pipeline(actor(req));
    return sendSuccess({ res, message: "Sales pipeline fetched successfully", data });
  }),

  forecast: asyncHandler(async (req: Request, res: Response) => {
    const data = await opportunityService.forecast(actor(req));
    return sendSuccess({ res, message: "Sales forecast fetched successfully", data });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const opportunity = await opportunityService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Opportunity fetched successfully", data: opportunity });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const opportunity = await opportunityService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Opportunity created successfully", data: opportunity });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const opportunity = await opportunityService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Opportunity updated successfully", data: opportunity });
  }),

  updateStage: asyncHandler(async (req: Request, res: Response) => {
    const opportunity = await opportunityService.updateStage(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Opportunity stage updated successfully", data: opportunity });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const opportunity = await opportunityService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Opportunity deleted successfully", data: opportunity });
  }),
};
