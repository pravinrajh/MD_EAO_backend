import type { Request, Response } from "express";
import { assistantActionService } from "../services/assistant/action.service";
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

export const assistantActionController = {
  processAction: asyncHandler(async (req: Request, res: Response) => {
    const data = await assistantActionService.processAction({
      message: String(req.body.message),
      conversationId: typeof req.body.conversationId === "string" ? req.body.conversationId : undefined,
      actor: actor(req),
      idempotencyKey: idempotencyKey(req),
    });
    return sendSuccess({ res, message: "Action processed successfully", data });
  }),

  confirmAction: asyncHandler(async (req: Request, res: Response) => {
    const data = await assistantActionService.confirmAction({
      actionId: String(req.params.actionId),
      actor: actor(req),
      confirmed: Boolean(req.body.confirmed),
    });
    return sendSuccess({ res, message: "Confirmation processed successfully", data });
  }),

  getActionHistory: asyncHandler(async (req: Request, res: Response) => {
    const result = await assistantActionService.getHistory(actor(req), req.query as Record<string, unknown>);
    return sendSuccess({
      res,
      message: "Assistant action history fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),
};
