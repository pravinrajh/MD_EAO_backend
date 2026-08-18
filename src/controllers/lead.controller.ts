import type { Request, Response } from "express";
import { leadService } from "../services/lead.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const leadController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await leadService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Leads fetched successfully", data: result.items, meta: result.meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const lead = await leadService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Lead fetched successfully", data: lead });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const lead = await leadService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Lead created successfully", data: lead });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const lead = await leadService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Lead updated successfully", data: lead });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const lead = await leadService.updateStatus(String(req.params.id), req.body.status, actor(req));
    return sendSuccess({ res, message: "Lead status updated successfully", data: lead });
  }),

  updateFollowUp: asyncHandler(async (req: Request, res: Response) => {
    const lead = await leadService.updateFollowUp(String(req.params.id), req.body.nextFollowUpAt, actor(req));
    return sendSuccess({ res, message: "Lead follow-up updated successfully", data: lead });
  }),

  convert: asyncHandler(async (req: Request, res: Response) => {
    const data = await leadService.convert(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Lead converted successfully", data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const lead = await leadService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Lead deleted successfully", data: lead });
  }),
};
