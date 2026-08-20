import type { Request, Response } from "express";
import { authService } from "../services/auth.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    return sendSuccess({
      res,
      statusCode: 201,
      message: "Registered successfully",
      data: result,
    });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body.email, req.body.password);
    return sendSuccess({
      res,
      message: "Logged in successfully",
      data: result,
    });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.refresh(req.body.refreshToken);
    return sendSuccess({
      res,
      message: "Token refreshed successfully",
      data: result,
    });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.me(req.user!.id);
    return sendSuccess({
      res,
      message: "Profile fetched successfully",
      data: user,
    });
  }),

  updateMe: asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.updateProfile(req.user!.id, req.body);
    return sendSuccess({
      res,
      message: "Profile updated successfully",
      data: user,
    });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    await authService.logout(req.user!.id, req.body?.refreshToken);
    return sendSuccess({
      res,
      message: "Logged out successfully",
      data: null,
    });
  }),
};
