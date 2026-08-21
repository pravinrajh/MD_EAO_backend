import type { Request, Response } from "express";
import { vendorService } from "../services/vendor.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const vendorController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await vendorService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Vendors fetched successfully", data: result.items, meta: result.meta });
  }),
  getById: asyncHandler(async (req: Request, res: Response) => {
    const vendor = await vendorService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Vendor fetched successfully", data: vendor });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const vendor = await vendorService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Vendor created successfully", data: vendor });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const vendor = await vendorService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Vendor updated successfully", data: vendor });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    const vendor = await vendorService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Vendor deleted successfully", data: vendor });
  }),
};
