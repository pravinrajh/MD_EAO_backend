import { z } from "zod";
import {
  CUSTOMER_STATUSES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
  SALES_ACTIVITY_STATUSES,
  SALES_ACTIVITY_TYPES,
} from "../utils/constants";
import { phoneSchema } from "./auth.validation";
import {
  isoDateSchema,
  moneyIntSchema,
  objectIdSchema,
  optionalIsoDateSchema,
  optionalObjectIdSchema,
  probabilitySchema,
  rejectMongoOperators,
} from "./common.validation";

const optionalPhone = z.union([phoneSchema, z.literal("")]).optional();
const optionalEmail = z.union([z.string().trim().email("Invalid email").max(160), z.literal("")]).optional();

function requireContact(value: { email?: string; phone?: string }, ctx: z.RefinementCtx): void {
  const email = (value.email ?? "").trim();
  const phone = (value.phone ?? "").trim();
  if (!email && !phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "email or phone is required",
      path: ["email"],
    });
  }
}

export const createLeadSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(160),
    companyName: z.string().trim().max(160).optional(),
    email: optionalEmail,
    phone: optionalPhone,
    alternatePhone: optionalPhone,
    source: z.enum(LEAD_SOURCES),
    industry: z.string().trim().max(120).optional(),
    location: z.string().trim().max(160).optional(),
    description: z.string().trim().max(4000).optional(),
    assignedTo: optionalObjectIdSchema,
    priority: z.enum(LEAD_PRIORITIES).default("MEDIUM"),
    estimatedValue: moneyIntSchema.optional(),
    expectedCloseDate: optionalIsoDateSchema,
    nextFollowUpAt: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine(requireContact);

export const updateLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    companyName: z.string().trim().max(160).optional(),
    email: optionalEmail,
    phone: optionalPhone,
    alternatePhone: optionalPhone,
    source: z.enum(LEAD_SOURCES).optional(),
    industry: z.string().trim().max(120).optional(),
    location: z.string().trim().max(160).optional(),
    description: z.string().trim().max(4000).optional(),
    assignedTo: optionalObjectIdSchema,
    priority: z.enum(LEAD_PRIORITIES).optional(),
    estimatedValue: moneyIntSchema.optional(),
    expectedCloseDate: optionalIsoDateSchema,
    nextFollowUpAt: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const updateLeadStatusSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateLeadFollowUpSchema = z
  .object({
    nextFollowUpAt: isoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const convertLeadSchema = z
  .object({
    createCustomer: z.boolean().default(true),
    createOpportunity: z.boolean().default(true),
    opportunity: z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        estimatedValue: moneyIntSchema.optional(),
        expectedCloseDate: optionalIsoDateSchema,
        description: z.string().trim().max(4000).optional(),
        stage: z.enum(OPPORTUNITY_STAGES).optional(),
        probability: probabilitySchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine((value, ctx) => {
    if (value.createOpportunity && value.createCustomer === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "createCustomer must be true when creating an opportunity from a lead",
        path: ["createCustomer"],
      });
    }
  });

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  assignedTo: objectIdSchema.optional(),
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  sortBy: z.enum(["createdAt", "expectedCloseDate", "nextFollowUpAt", "estimatedValue", "name", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(160),
    companyName: z.string().trim().max(160).optional(),
    email: optionalEmail,
    phone: optionalPhone,
    alternatePhone: optionalPhone,
    industry: z.string().trim().max(120).optional(),
    location: z.string().trim().max(160).optional(),
    address: z.string().trim().max(500).optional(),
    taxIdentifier: z.string().trim().max(32).optional(),
    assignedTo: optionalObjectIdSchema,
    status: z.enum(CUSTOMER_STATUSES).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine(requireContact);

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    companyName: z.string().trim().max(160).optional(),
    email: optionalEmail,
    phone: optionalPhone,
    alternatePhone: optionalPhone,
    industry: z.string().trim().max(120).optional(),
    location: z.string().trim().max(160).optional(),
    address: z.string().trim().max(500).optional(),
    taxIdentifier: z.string().trim().max(32).optional(),
    assignedTo: optionalObjectIdSchema,
    notes: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const updateCustomerStatusSchema = z
  .object({
    status: z.enum(CUSTOMER_STATUSES),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  assignedTo: objectIdSchema.optional(),
  industry: z.string().trim().max(120).optional(),
  location: z.string().trim().max(160).optional(),
  sortBy: z.enum(["createdAt", "name", "companyName", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const createOpportunitySchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    customerId: objectIdSchema,
    leadId: optionalObjectIdSchema,
    projectId: optionalObjectIdSchema,
    assignedTo: optionalObjectIdSchema,
    stage: z.enum(OPPORTUNITY_STAGES).optional(),
    probability: probabilitySchema.optional(),
    estimatedValue: moneyIntSchema.optional(),
    expectedCloseDate: optionalIsoDateSchema,
    description: z.string().trim().max(4000).optional(),
    nextFollowUpAt: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateOpportunitySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    customerId: objectIdSchema.optional(),
    leadId: optionalObjectIdSchema,
    projectId: optionalObjectIdSchema,
    assignedTo: optionalObjectIdSchema,
    probability: probabilitySchema.optional(),
    estimatedValue: moneyIntSchema.optional(),
    expectedCloseDate: optionalIsoDateSchema,
    description: z.string().trim().max(4000).optional(),
    nextFollowUpAt: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const updateOpportunityStageSchema = z
  .object({
    stage: z.enum(OPPORTUNITY_STAGES),
    lostReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine((value, ctx) => {
    if (value.stage === "LOST" && !value.lostReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lostReason is required when moving to LOST",
        path: ["lostReason"],
      });
    }
    if (value.stage !== "LOST" && value.lostReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lostReason is only allowed when moving to LOST",
        path: ["lostReason"],
      });
    }
  });

export const listOpportunitiesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  assignedTo: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  sortBy: z.enum(["createdAt", "expectedCloseDate", "nextFollowUpAt", "estimatedValue", "probability", "title", "stage"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const createSalesActivitySchema = z
  .object({
    type: z.enum(SALES_ACTIVITY_TYPES),
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(4000).optional(),
    leadId: optionalObjectIdSchema,
    customerId: optionalObjectIdSchema,
    opportunityId: optionalObjectIdSchema,
    employeeId: optionalObjectIdSchema,
    scheduledAt: optionalIsoDateSchema,
    status: z.enum(SALES_ACTIVITY_STATUSES).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .superRefine((value, ctx) => {
    if (!value.leadId && !value.customerId && !value.opportunityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Activity must be linked to a lead, customer, or opportunity",
        path: ["leadId"],
      });
    }
  });

export const updateSalesActivitySchema = z
  .object({
    type: z.enum(SALES_ACTIVITY_TYPES).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    leadId: optionalObjectIdSchema,
    customerId: optionalObjectIdSchema,
    opportunityId: optionalObjectIdSchema,
    employeeId: objectIdSchema.optional(),
    scheduledAt: optionalIsoDateSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const updateSalesActivityStatusSchema = z
  .object({
    status: z.enum(SALES_ACTIVITY_STATUSES),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listSalesActivitiesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(50).optional(),
  leadId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  opportunityId: objectIdSchema.optional(),
  employeeId: objectIdSchema.optional(),
  type: z.enum(SALES_ACTIVITY_TYPES).optional(),
  status: z.enum(SALES_ACTIVITY_STATUSES).optional(),
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  sortBy: z.enum(["createdAt", "scheduledAt", "status", "type", "title"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const listFollowUpsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  assignedTo: objectIdSchema.optional(),
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
});

export const listMySalesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
