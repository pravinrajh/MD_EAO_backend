import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72)
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/\d/, "Password must include a number");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Phone must be a valid 10-digit Indian mobile number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().email("Invalid email").max(160),
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(["EMPLOYEE"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(1).max(72),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

/** Self-service profile edit. Role/status cannot be changed here. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(120).optional(),
    phone: phoneSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.phone !== undefined, {
    message: "Provide at least one of name or phone",
  });
