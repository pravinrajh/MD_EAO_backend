import type { Request, Response } from "express";
import { accountService } from "../services/account.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const accountController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await accountService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Accounts fetched successfully", data: result.items, meta: result.meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const account = await accountService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Account fetched successfully", data: account });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const account = await accountService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Account created successfully", data: account });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const account = await accountService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Account updated successfully", data: account });
  }),
};
