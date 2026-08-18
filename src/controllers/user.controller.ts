import type { Request, Response } from "express";
import { userService } from "../services/user.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const userController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await userService.list(req.query as Record<string, unknown>);
    return sendSuccess({
      res,
      message: "Users fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.getById(String(req.params.id));
    return sendSuccess({
      res,
      message: "User fetched successfully",
      data: user,
    });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.create(req.body, actor(req));
    return sendSuccess({
      res,
      statusCode: 201,
      message: "User created successfully",
      data: user,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({
      res,
      message: "User updated successfully",
      data: user,
    });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.updateStatus(String(req.params.id), req.body.status, actor(req));
    return sendSuccess({
      res,
      message: "User status updated successfully",
      data: user,
    });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.remove(String(req.params.id), actor(req));
    return sendSuccess({
      res,
      message: "User deactivated successfully",
      data: user,
    });
  }),
};
