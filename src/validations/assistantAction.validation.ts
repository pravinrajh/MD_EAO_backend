import { z } from "zod";
import { ASSISTANT_IDEMPOTENCY_MAX, ASSISTANT_MESSAGE_MAX } from "../utils/constants";
import { rejectMongoOperators } from "./common.validation";

export const processActionSchema = z
  .object({
    message: z
      .string({ required_error: "message is required", invalid_type_error: "message must be a string" })
      .trim()
      .min(1, "message is required")
      .max(ASSISTANT_MESSAGE_MAX, `message must be at most ${ASSISTANT_MESSAGE_MAX} characters`),
    conversationId: z
      .string({ invalid_type_error: "conversationId must be a string" })
      .trim()
      .min(1, "conversationId cannot be empty")
      .max(100, "conversationId must be at most 100 characters")
      .optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const confirmActionSchema = z
  .object({
    confirmed: z.boolean({
      required_error: "confirmed is required",
      invalid_type_error: "confirmed must be a boolean",
    }),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const actionIdParamSchema = z
  .object({
    actionId: z
      .string({ required_error: "actionId is required" })
      .regex(/^ACT-\d{6}$/, "Invalid actionId"),
  })
  .strict();

export const actionHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    conversationId: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_IDEMPOTENCY_MAX, `Idempotency-Key must be at most ${ASSISTANT_IDEMPOTENCY_MAX} characters`);
