import { z } from "zod";
import { DASHBOARD_HEALTH, DASHBOARD_LIMITS, PROJECT_STATUSES } from "../utils/constants";
import { optionalIsoDateSchema, rejectMongoOperators } from "./common.validation";

const calendarDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .optional();

export const dashboardQuerySchema = z
  .object({
    date: calendarDateSchema,
    from: optionalIsoDateSchema,
    to: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const upcomingMeetingsQuerySchema = z
  .object({
    date: calendarDateSchema,
    days: z.coerce.number().int().min(1).max(31).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const projectHealthQuerySchema = z
  .object({
    date: calendarDateSchema,
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(DASHBOARD_LIMITS.projectHealthMax).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    health: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.enum([...DASHBOARD_HEALTH, "HEALTHY", "ATTENTION", "CRITICAL", "AT_RISK"]))
      .optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const activityQuerySchema = z
  .object({
    date: calendarDateSchema,
    from: optionalIsoDateSchema,
    to: optionalIsoDateSchema,
    limit: z.coerce.number().int().positive().max(DASHBOARD_LIMITS.activity).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);
