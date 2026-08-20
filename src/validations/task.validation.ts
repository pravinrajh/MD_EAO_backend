import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "../utils/constants";
import {
  objectIdSchema,
  optionalIsoDateSchema,
  optionalObjectIdSchema,
  rejectMongoOperators,
} from "./common.validation";

const booleanQuery = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return value === true || value === "true";
  });

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(4000).optional(),
    assignedTo: objectIdSchema,
    projectId: optionalObjectIdSchema,
    customerId: optionalObjectIdSchema,
    meetingId: optionalObjectIdSchema,
    priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
    dueDate: optionalIsoDateSchema,
    reminderAt: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine((value, ctx) => {
    if (value.reminderAt && value.dueDate && value.reminderAt.getTime() > value.dueDate.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reminderAt must be on or before dueDate",
        path: ["reminderAt"],
      });
    }
  });

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    assignedTo: objectIdSchema.optional(),
    projectId: optionalObjectIdSchema,
    customerId: optionalObjectIdSchema,
    meetingId: optionalObjectIdSchema,
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: optionalIsoDateSchema,
    reminderAt: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const updateTaskAssigneeSchema = z
  .object({
    assignedTo: objectIdSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateTaskStatusSchema = z
  .object({
    status: z.enum(TASK_STATUSES),
    completionNote: z.string().trim().max(1000).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine((value, ctx) => {
    if (value.completionNote && value.status !== "COMPLETED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "completionNote is only allowed when completing a task",
        path: ["completionNote"],
      });
    }
    if (value.reason && value.status !== "CANCELLED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reason is only allowed when cancelling a task",
        path: ["reason"],
      });
    }
  });

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignedTo: objectIdSchema.optional(),
  createdBy: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  meetingId: objectIdSchema.optional(),
  dueFrom: optionalIsoDateSchema,
  dueTo: optionalIsoDateSchema,
  overdue: booleanQuery,
  includeDeleted: booleanQuery,
  sortBy: z.enum(["createdAt", "dueDate", "priority", "status", "taskId", "title"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const myTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  overdue: booleanQuery,
  sortBy: z.enum(["createdAt", "dueDate", "priority", "status", "taskId"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
