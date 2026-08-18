import type { Request, Response } from "express";
import { customerService } from "../services/customer.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const customerController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await customerService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Customers fetched successfully", data: result.items, meta: result.meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Customer fetched successfully", data: customer });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Customer created successfully", data: customer });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Customer updated successfully", data: customer });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.updateStatus(String(req.params.id), req.body.status, actor(req));
    return sendSuccess({ res, message: "Customer status updated successfully", data: customer });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Customer deleted successfully", data: customer });
  }),
};
