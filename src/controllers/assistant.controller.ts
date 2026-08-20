import type { Request, Response } from "express";
import { assistantService } from "../services/assistant/assistant.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const assistantController = {
  queryAssistant: asyncHandler(async (req: Request, res: Response) => {
    const data = await assistantService.processQuery({
      message: String(req.body.message),
      conversationId: typeof req.body.conversationId === "string" ? req.body.conversationId : undefined,
      actor: actor(req),
    });
    return sendSuccess({ res, message: "Query processed successfully", data });
  }),

  getAssistantHistory: asyncHandler(async (req: Request, res: Response) => {
    const result = await assistantService.getHistory(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({
      res,
      message: "Assistant history fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),
};
