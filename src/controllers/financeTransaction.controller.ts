import type { Request, Response } from "express";
import { financeTransactionService } from "../services/financeTransaction.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ValidationError } from "../utils/errors";

function actor(req: Request) {
  return req.user!;
}

function idempotencyKey(req: Request): string | undefined {
  const raw = req.header("Idempotency-Key");
  if (!raw) return undefined;
  const key = raw.trim();
  if (!key) return undefined;
  if (key.length > 128) {
    throw new ValidationError("Idempotency-Key is too long", [{ field: "Idempotency-Key" }]);
  }
  return key;
}

export const financeTransactionController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await financeTransactionService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Transactions fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const txn = await financeTransactionService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Transaction fetched successfully", data: txn });
  }),

  createIncome: asyncHandler(async (req: Request, res: Response) => {
    const txn = await financeTransactionService.createIncome(req.body, actor(req), idempotencyKey(req));
    return sendSuccess({ res, statusCode: 201, message: "Transaction created successfully", data: txn });
  }),

  createExpense: asyncHandler(async (req: Request, res: Response) => {
    const txn = await financeTransactionService.createExpense(req.body, actor(req), idempotencyKey(req));
    return sendSuccess({ res, statusCode: 201, message: "Transaction created successfully", data: txn });
  }),

  createTransfer: asyncHandler(async (req: Request, res: Response) => {
    const txn = await financeTransactionService.createTransfer(req.body, actor(req), idempotencyKey(req));
    return sendSuccess({ res, statusCode: 201, message: "Transaction created successfully", data: txn });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const txn = await financeTransactionService.updateStatus(String(req.params.id), req.body.status, actor(req));
    return sendSuccess({ res, message: "Transaction status updated successfully", data: txn });
  }),
};
