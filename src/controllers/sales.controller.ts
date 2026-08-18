import type { Request, Response } from "express";
import { salesService } from "../services/sales.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const salesController = {
  summary: asyncHandler(async (req: Request, res: Response) => {
    const data = await salesService.summary(actor(req));
    return sendSuccess({ res, message: "Sales summary fetched successfully", data });
  }),

  mySales: asyncHandler(async (req: Request, res: Response) => {
    const data = await salesService.mySales(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "My sales fetched successfully", data });
  }),

  followUps: asyncHandler(async (req: Request, res: Response) => {
    const data = await salesService.followUps(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Sales follow-ups fetched successfully", data });
  }),
};
