import type { NextFunction, Request, Response } from "express";
import { User } from "../models/User";
import { UnauthorizedError } from "../utils/errors";
import { verifyAccessToken } from "../utils/generateToken";
import { asyncHandler } from "../utils/asyncHandler";

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    throw new UnauthorizedError("Authentication required");
  }

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub).select("role status isActive").lean();

  if (!user || !user.isActive || user.status !== "ACTIVE") {
    throw new UnauthorizedError("Account is not active");
  }

  req.user = {
    id: String(user._id),
    role: user.role,
  };

  next();
});
