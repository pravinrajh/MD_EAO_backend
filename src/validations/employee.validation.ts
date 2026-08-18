import { z } from "zod";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from "../utils/constants";
import { phoneSchema } from "./auth.validation";
import { idParamSchema, objectIdSchema, rejectMongoOperators } from "./common.validation";

export { idParamSchema };

const optionalPhone = z
  .union([phoneSchema, z.literal("")])
  .optional();

const joiningDateSchema = z
  .union([z.string().min(1), z.date()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid joining date" });
      return z.NEVER;
    }
    return date;
  });

export const createEmployeeSchema = z
  .object({
    userId: objectIdSchema,
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    displayName: z.string().trim().min(1).max(160).optional(),
    phone: optionalPhone,
    department: z.string().trim().max(120).optional(),
    designation: z.string().trim().max(120).optional(),
    managerId: objectIdSchema.optional(),
    joiningDate: joiningDateSchema,
    employmentType: z.enum(EMPLOYMENT_TYPES).default("FULL_TIME"),
    location: z.string().trim().max(120).optional(),
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    profileImage: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateEmployeeSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    displayName: z.string().trim().min(1).max(160).optional(),
    phone: optionalPhone,
    department: z.string().trim().max(120).optional(),
    designation: z.string().trim().max(120).optional(),
    managerId: z.union([objectIdSchema, z.null()]).optional(),
    joiningDate: joiningDateSchema,
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    location: z.string().trim().max(120).optional(),
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    profileImage: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const updateEmployeeStatusSchema = z
  .object({
    status: z.enum(EMPLOYEE_STATUSES),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  department: z.string().trim().max(120).optional(),
  designation: z.string().trim().max(120).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  managerId: objectIdSchema.optional(),
  sortBy: z.enum(["createdAt", "firstName", "lastName", "department", "designation", "employeeCode"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
