import { z } from "zod";
import {
  REMINDER_FREQUENCIES,
  REMINDER_PRIORITIES,
  REMINDER_SOURCE_TYPES,
  REMINDER_STATUSES,
  REMINDER_TYPES,
  REMINDER_WEEKDAYS,
} from "../utils/constants";
import { isValidTimeZone } from "../utils/timezone";
import {
  isoDateSchema,
  objectIdSchema,
  optionalIsoDateSchema,
  optionalObjectIdSchema,
  rejectMongoOperators,
} from "./common.validation";

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: "Invalid timezone" });

const recurrenceSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(REMINDER_FREQUENCIES),
    interval: z.number().int().min(1).max(30).default(1),
    daysOfWeek: z.array(z.enum(REMINDER_WEEKDAYS)).max(7).optional(),
    endAt: optionalIsoDateSchema.nullable(),
  })
  .strict();

const metadataSchema = z.record(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional();

export const createReminderSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(4000).optional(),
    reminderType: z.enum(REMINDER_TYPES).optional(),
    sourceType: z.enum(REMINDER_SOURCE_TYPES).optional(),
    sourceId: optionalObjectIdSchema,
    scheduledAt: isoDateSchema,
    timezone: timezoneSchema.optional(),
    priority: z.enum(REMINDER_PRIORITIES).optional(),
    actionUrl: z.string().trim().max(300).optional(),
    metadata: metadataSchema,
    recurrence: recurrenceSchema.optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine((value, ctx) => {
    if (value.sourceType && value.sourceType !== "CUSTOM" && value.sourceType !== "SYSTEM" && !value.sourceId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required", path: ["sourceId"] });
    }
  });

export const updateReminderSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    scheduledAt: optionalIsoDateSchema,
    timezone: timezoneSchema.optional(),
    priority: z.enum(REMINDER_PRIORITIES).optional(),
    actionUrl: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const snoozeReminderSchema = z
  .object({
    scheduledAt: isoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listRemindersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(REMINDER_STATUSES).optional(),
    reminderType: z.enum(REMINDER_TYPES).optional(),
    priority: z.enum(REMINDER_PRIORITIES).optional(),
    from: optionalIsoDateSchema,
    to: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const upcomingRemindersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    days: z.coerce.number().int().min(1).max(30).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const reminderIdParamSchema = z.object({
  id: objectIdSchema,
});
