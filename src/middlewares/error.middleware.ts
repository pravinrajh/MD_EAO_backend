import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { isProduction } from "../config/env";
import { sendError } from "../utils/apiResponse";
import { AppError } from "../utils/errors";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  if (err instanceof ZodError) {
    return sendError({
      res,
      statusCode: 422,
      message: "Validation failed",
      errors: err.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    });
  }

  if (err instanceof AppError) {
    logger.warn({ err, statusCode: err.statusCode }, err.message);
    return sendError({
      res,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
    });
  }

  if (err instanceof mongoose.Error.CastError) {
    return sendError({
      res,
      statusCode: 400,
      message: "Invalid identifier",
    });
  }

  if (typeof err === "object" && err !== null && "code" in err && (err as { code?: number }).code === 11000) {
    return sendError({
      res,
      statusCode: 409,
      message: "Resource already exists",
    });
  }

  logger.error({ err }, "Unhandled error");

  return sendError({
    res,
    statusCode: 500,
    message: isProduction ? "Internal server error" : err instanceof Error ? err.message : "Internal server error",
  });
}
