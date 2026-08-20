import { z } from "zod";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  BUDGET_STATUSES,
  DEFAULT_CURRENCY,
  FINANCE_CATEGORY_STATUSES,
  FINANCE_CATEGORY_TYPES,
  FINANCE_CURRENCIES,
  FINANCE_TRANSACTION_STATUSES,
  FINANCE_TRANSACTION_TYPES,
  PAYMENT_METHODS,
} from "../utils/constants";
import {
  isoDateSchema,
  moneyIntSchema,
  objectIdSchema,
  optionalIsoDateSchema,
  optionalObjectIdSchema,
  positiveMoneyIntSchema,
  rejectMongoOperators,
} from "./common.validation";

const financeCodeSchema = z
  .string()
  .trim()
  .min(1, "Code is required")
  .max(16)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9][A-Z0-9-]*$/.test(value), {
    message: "Code must be alphanumeric with optional hyphens",
  });

const currencySchema = z.enum(FINANCE_CURRENCIES).default(DEFAULT_CURRENCY);

export const createAccountSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(160),
    code: financeCodeSchema,
    type: z.enum(ACCOUNT_TYPES),
    description: z.string().trim().max(4000).optional(),
    openingBalance: moneyIntSchema.optional(),
    currency: currencySchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(4000).optional(),
    status: z.enum(ACCOUNT_STATUSES).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const listAccountsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  sortBy: z.enum(["name", "code", "createdAt", "type", "currentBalance"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const createFinanceCategorySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(160),
    code: financeCodeSchema,
    type: z.enum(FINANCE_CATEGORY_TYPES),
    description: z.string().trim().max(4000).optional(),
    status: z.enum(FINANCE_CATEGORY_STATUSES).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateFinanceCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(4000).optional(),
    status: z.enum(FINANCE_CATEGORY_STATUSES).optional(),
    type: z.enum(FINANCE_CATEGORY_TYPES).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const listFinanceCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  type: z.enum(FINANCE_CATEGORY_TYPES).optional(),
  status: z.enum(FINANCE_CATEGORY_STATUSES).optional(),
  sortBy: z.enum(["name", "code", "createdAt", "type"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const transactionBase = {
  accountId: objectIdSchema,
  categoryId: objectIdSchema,
  amount: positiveMoneyIntSchema,
  currency: currencySchema,
  description: z.string().trim().max(4000).optional(),
  projectId: optionalObjectIdSchema,
  customerId: optionalObjectIdSchema,
  opportunityId: optionalObjectIdSchema,
  transactionDate: optionalIsoDateSchema,
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  externalReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(FINANCE_TRANSACTION_STATUSES).optional(),
};

export const createIncomeSchema = z.object(transactionBase).strict().superRefine(rejectMongoOperators);

export const createExpenseSchema = z.object(transactionBase).strict().superRefine(rejectMongoOperators);

export const createTransferSchema = z
  .object({
    fromAccountId: objectIdSchema,
    toAccountId: objectIdSchema,
    amount: positiveMoneyIntSchema,
    currency: currencySchema,
    description: z.string().trim().max(4000).optional(),
    transactionDate: optionalIsoDateSchema,
    notes: z.string().trim().max(4000).optional(),
    status: z.enum(FINANCE_TRANSACTION_STATUSES).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: "Source and destination accounts must be different",
    path: ["toAccountId"],
  });

export const updateTransactionStatusSchema = z
  .object({
    status: z.enum(FINANCE_TRANSACTION_STATUSES),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  type: z.enum(FINANCE_TRANSACTION_TYPES).optional(),
  status: z.enum(FINANCE_TRANSACTION_STATUSES).optional(),
  accountId: objectIdSchema.optional(),
  categoryId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  opportunityId: objectIdSchema.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  sortBy: z.enum(["transactionDate", "createdAt", "amount", "status", "type"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const createBudgetSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(160),
    projectId: optionalObjectIdSchema,
    categoryId: optionalObjectIdSchema,
    amount: positiveMoneyIntSchema,
    currency: currencySchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    status: z.enum(BUDGET_STATUSES).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine((value, ctx) => {
    if (value.periodEnd.getTime() < value.periodStart.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "periodEnd must be on or after periodStart",
        path: ["periodEnd"],
      });
    }
  });

export const updateBudgetSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    projectId: optionalObjectIdSchema,
    categoryId: optionalObjectIdSchema,
    amount: positiveMoneyIntSchema.optional(),
    periodStart: optionalIsoDateSchema,
    periodEnd: optionalIsoDateSchema,
    status: z.enum(BUDGET_STATUSES).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const listBudgetsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  projectId: objectIdSchema.optional(),
  categoryId: objectIdSchema.optional(),
  status: z.enum(BUDGET_STATUSES).optional(),
  sortBy: z.enum(["createdAt", "periodStart", "periodEnd", "amount", "name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const financeSummaryQuerySchema = z.object({
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  projectId: objectIdSchema.optional(),
  accountId: objectIdSchema.optional(),
});

export const monthlyReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  projectId: objectIdSchema.optional(),
});

export const expensesByCategoryQuerySchema = z.object({
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  projectId: objectIdSchema.optional(),
});
