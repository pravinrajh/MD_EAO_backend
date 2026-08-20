import { z } from "zod";
import { env } from "../config/env";
import { MAX_CALENDAR_RANGE_DAYS, MAX_MEETING_PARTICIPANTS, MEETING_STATUSES, MEETING_TYPES } from "../utils/constants";
import { getZonedDayRange, isValidTimeZone } from "../utils/timezone";
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

const participantsSchema = z
  .array(objectIdSchema)
  .max(MAX_MEETING_PARTICIPANTS, `A meeting can have at most ${MAX_MEETING_PARTICIPANTS} participants`)
  .refine((ids) => ids.length === new Set(ids).size, {
    message: "Duplicate participants are not allowed",
  })
  .optional();

export const createMeetingSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(4000).optional(),
    meetingType: z.enum(MEETING_TYPES).default("INTERNAL"),
    participants: participantsSchema,
    projectId: optionalObjectIdSchema,
    customerId: optionalObjectIdSchema,
    location: z.string().trim().max(200).optional(),
    startTime: isoDateSchema,
    endTime: isoDateSchema,
    timezone: timezoneSchema.default(env.APP_TIMEZONE),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    meetingType: z.enum(MEETING_TYPES).optional(),
    participants: participantsSchema,
    projectId: optionalObjectIdSchema,
    customerId: optionalObjectIdSchema,
    location: z.string().trim().max(200).optional(),
    startTime: optionalIsoDateSchema,
    endTime: optionalIsoDateSchema,
    timezone: timezoneSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const rescheduleMeetingSchema = z
  .object({
    startTime: isoDateSchema,
    endTime: isoDateSchema,
    timezone: timezoneSchema.optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateMeetingStatusSchema = z
  .object({
    status: z.enum(MEETING_STATUSES),
    notes: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const cancelMeetingSchema = z
  .object({
    reason: z.string().trim().min(1, "Cancellation reason is required").max(500),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listMeetingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  status: z.enum(MEETING_STATUSES).optional(),
  meetingType: z.enum(MEETING_TYPES).optional(),
  organizerId: objectIdSchema.optional(),
  participantId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  sortBy: z.enum(["startTime", "endTime", "createdAt", "title", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const upcomingMeetingsQuerySchema = listMeetingsQuerySchema.extend({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

function parseCalendarBound(raw: string, bound: "start" | "end"): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const midday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (Number.isNaN(midday.getTime())) return null;
    const range = getZonedDayRange(midday, env.APP_TIMEZONE);
    return bound === "start" ? range.start : range.end;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const calendarQuerySchema = z
  .object({
    from: z.string().trim().min(1).max(40),
    to: z.string().trim().min(1).max(40),
  })
  .transform((value, ctx) => {
    const from = parseCalendarBound(value.from, "start");
    const to = parseCalendarBound(value.to, "end");
    if (!from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date", path: ["from"] });
      return z.NEVER;
    }
    if (!to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date", path: ["to"] });
      return z.NEVER;
    }
    if (from.getTime() >= to.getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must be before to", path: ["to"] });
      return z.NEVER;
    }
    const maxMs = MAX_CALENDAR_RANGE_DAYS * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Calendar range cannot exceed ${MAX_CALENDAR_RANGE_DAYS} days`,
        path: ["to"],
      });
      return z.NEVER;
    }
    return { from, to };
  });
