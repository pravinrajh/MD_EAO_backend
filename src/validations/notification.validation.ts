import { z } from "zod";
import { NOTIFICATION_PRIORITIES, NOTIFICATION_TYPES } from "../utils/constants";
import { objectIdSchema, optionalIsoDateSchema, rejectMongoOperators } from "./common.validation";

const booleanQuery = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return value === true || value === "true";
  });

export const listNotificationsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    isRead: booleanQuery,
    type: z.enum(NOTIFICATION_TYPES).optional(),
    priority: z.enum(NOTIFICATION_PRIORITIES).optional(),
    from: optionalIsoDateSchema,
    to: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const notificationIdParamSchema = z.object({
  id: objectIdSchema,
});
