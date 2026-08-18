import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid MongoDB ObjectId");

export const optionalObjectIdSchema = z.union([objectIdSchema, z.null()]).optional();

export const isoDateSchema = z
  .union([z.string().min(1), z.date()])
  .transform((value, ctx) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
      return z.NEVER;
    }
    return date;
  });

export const optionalIsoDateSchema = isoDateSchema.optional();

export const idParamSchema = z.object({
  id: objectIdSchema,
});

export function rejectMongoOperators<T extends Record<string, unknown>>(value: T, ctx: z.RefinementCtx): void {
  for (const key of Object.keys(value)) {
    if (key.startsWith("$")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MongoDB operators are not allowed",
        path: [key],
      });
    }
  }
}

/** Whole INR rupees. Matches Project monetary storage. */
export const moneyIntSchema = z
  .number({ invalid_type_error: "Monetary values must be a number" })
  .int("Monetary values must be whole currency units")
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

export const probabilitySchema = z.number().int().min(0).max(100);
