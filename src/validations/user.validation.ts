import { z } from "zod";
import { ROLES, USER_STATUSES } from "../utils/constants";
import { passwordSchema, phoneSchema } from "./auth.validation";
import { idParamSchema, rejectMongoOperators } from "./common.validation";

export { idParamSchema };

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(120),
    email: z.string().trim().email("Invalid email address").max(160),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    role: z.enum(ROLES).default("EMPLOYEE"),
    status: z.enum(USER_STATUSES).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const updateUserStatusSchema = z
  .object({
    status: z.enum(USER_STATUSES),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sortBy: z.enum(["createdAt", "name", "email", "role"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
