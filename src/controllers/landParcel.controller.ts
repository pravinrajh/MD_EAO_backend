import type { Request, Response } from "express";
import { landParcelService } from "../services/landParcel.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const landParcelController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await landParcelService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Land parcels fetched successfully", data: result.items, meta: result.meta });
  }),
  getById: asyncHandler(async (req: Request, res: Response) => {
    const parcel = await landParcelService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Land parcel fetched successfully", data: parcel });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const parcel = await landParcelService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Land parcel created successfully", data: parcel });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const parcel = await landParcelService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Land parcel updated successfully", data: parcel });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    const parcel = await landParcelService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Land parcel deleted successfully", data: parcel });
  }),
};
