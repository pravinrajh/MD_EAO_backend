import type { Request, Response } from "express";
import { assistantService } from "../services/assistant/assistant.service";
import { chatService } from "../services/assistant/chat.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ASSISTANT_IDEMPOTENCY_MAX } from "../utils/constants";
import { ValidationError } from "../utils/errors";

function actor(req: Request) {
  return req.user!;
}

function idempotencyKey(req: Request): string | undefined {
  const raw = req.header("Idempotency-Key");
  if (!raw) return undefined;
  const key = raw.trim();
  if (!key) return undefined;
  if (key.length > ASSISTANT_IDEMPOTENCY_MAX) {
    throw new ValidationError("Idempotency-Key is too long", [{ field: "Idempotency-Key" }]);
  }
  return key;
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

  chat: asyncHandler(async (req: Request, res: Response) => {
    const data = await chatService.chat({
      message: String(req.body.message),
      conversationId: typeof req.body.conversationId === "string" ? req.body.conversationId : undefined,
      actor: actor(req),
      idempotencyKey: idempotencyKey(req),
    });
    return sendSuccess({ res, message: "Chat processed successfully", data });
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
