import { z } from "zod";
import { isValidTimeZone } from "../utils/timezone";
import { rejectMongoOperators } from "./common.validation";

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");

export const updateNotificationPreferenceSchema = z
  .object({
    channels: z
      .object({
        inApp: z.boolean().optional(),
        email: z.boolean().optional(),
        sms: z.boolean().optional(),
        push: z.boolean().optional(),
        whatsapp: z.boolean().optional(),
      })
      .strict()
      .optional(),
    categories: z
      .object({
        tasks: z.boolean().optional(),
        meetings: z.boolean().optional(),
        projects: z.boolean().optional(),
        crm: z.boolean().optional(),
        finance: z.boolean().optional(),
        reminders: z.boolean().optional(),
        system: z.boolean().optional(),
      })
      .strict()
      .optional(),
    quietHours: z
      .object({
        enabled: z.boolean().optional(),
        startTime: hhmm.optional(),
        endTime: hhmm.optional(),
        timezone: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .refine(isValidTimeZone, { message: "Invalid timezone" })
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });
