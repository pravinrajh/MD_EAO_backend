import { z } from "zod";
import { MAX_PROJECT_MEMBERS, PROJECT_STATUSES, PROJECT_TYPES } from "../utils/constants";
import {
  objectIdSchema,
  optionalIsoDateSchema,
  rejectMongoOperators,
} from "./common.validation";

export const projectCodeSchema = z
  .string()
  .trim()
  .max(32)
  .transform((value) => value.toUpperCase())
  .refine((value) => value === "" || /^[A-Z0-9][A-Z0-9-]*$/.test(value), {
    message: "Project code must be alphanumeric with optional hyphens",
  });

const moneySchema = z
  .number({ invalid_type_error: "Budget must be a number" })
  .int("Monetary values must be whole currency units")
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

const progressSchema = z.number().int().min(0).max(100);

const membersSchema = z
  .array(objectIdSchema)
  .max(MAX_PROJECT_MEMBERS, `A project can have at most ${MAX_PROJECT_MEMBERS} members`)
  .optional();

function dateRangeRefine(
  value: { startDate?: Date; expectedEndDate?: Date },
  ctx: z.RefinementCtx,
): void {
  if (value.startDate && value.expectedEndDate && value.expectedEndDate.getTime() < value.startDate.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "expectedEndDate cannot be before startDate",
      path: ["expectedEndDate"],
    });
  }
}

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(160),
    code: projectCodeSchema.optional(),
    description: z.string().trim().max(4000).optional(),
    location: z.string().trim().max(160).optional(),
    projectType: z.enum(PROJECT_TYPES),
    managerId: objectIdSchema,
    members: membersSchema,
    status: z.enum(PROJECT_STATUSES).optional(),
    progress: progressSchema.optional(),
    budget: moneySchema.optional(),
    startDate: optionalIsoDateSchema,
    expectedEndDate: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine(dateRangeRefine)
  .superRefine((value, ctx) => {
    if (value.status === "COMPLETED" && (value.progress ?? 0) < 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed projects must have progress 100",
        path: ["progress"],
      });
    }
  });

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    code: projectCodeSchema.optional(),
    description: z.string().trim().max(4000).optional(),
    location: z.string().trim().max(160).optional(),
    projectType: z.enum(PROJECT_TYPES).optional(),
    managerId: objectIdSchema.optional(),
    members: membersSchema,
    status: z.enum(PROJECT_STATUSES).optional(),
    progress: progressSchema.optional(),
    budget: moneySchema.optional(),
    startDate: optionalIsoDateSchema,
    expectedEndDate: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine(dateRangeRefine)
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const updateProjectStatusSchema = z
  .object({
    status: z.enum(PROJECT_STATUSES),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateProjectManagerSchema = z
  .object({
    managerId: objectIdSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateProjectMembersSchema = z
  .object({
    members: z.array(objectIdSchema).max(MAX_PROJECT_MEMBERS),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  projectType: z.enum(PROJECT_TYPES).optional(),
  managerId: objectIdSchema.optional(),
  location: z.string().trim().max(160).optional(),
  sortBy: z.enum(["createdAt", "name", "status", "progress", "startDate", "expectedEndDate"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
