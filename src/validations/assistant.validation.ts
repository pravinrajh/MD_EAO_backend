import { z } from "zod";
import { ASSISTANT_MESSAGE_MAX } from "../utils/constants";
import { rejectMongoOperators } from "./common.validation";

export const queryAssistantSchema = z
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

export const assistantHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    conversationId: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);
