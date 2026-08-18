import type { Request, Response } from "express";
import { getDatabaseState } from "../config/database";
import { sendError, sendSuccess } from "../utils/apiResponse";

export function getHealth(_req: Request, res: Response): Response {
  return sendSuccess({
    res,
    message: "API is healthy",
    data: {
      timestamp: new Date().toISOString(),
    },
  });
}

export function getDatabaseHealth(_req: Request, res: Response): Response {
  const state = getDatabaseState();

  if (!state.connected) {
    return sendError({
      res,
      statusCode: 503,
      message: "Database is not connected",
      errors: [{ readyState: state.readyState }],
    });
  }

  return sendSuccess({
    res,
    message: "Database is healthy",
    data: {
      connected: true,
      timestamp: new Date().toISOString(),
    },
  });
}
