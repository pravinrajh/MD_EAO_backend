import type { Request, Response } from "express";
import { financeCategoryService } from "../services/financeCategory.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const financeCategoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await financeCategoryService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Categories fetched successfully", data: result.items, meta: result.meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const category = await financeCategoryService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Category fetched successfully", data: category });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const category = await financeCategoryService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Category created successfully", data: category });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const category = await financeCategoryService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Category updated successfully", data: category });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const category = await financeCategoryService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Category deleted successfully", data: category });
  }),
};
