import { z } from "zod";
import {
  INVOICE_STATUSES,
  LAND_PARCEL_STATUSES,
  MD_NOTE_RELATED_TYPES,
  PAYMENT_METHODS,
  VENDOR_STATUSES,
} from "../utils/constants";
import { moneyIntSchema, objectIdSchema, optionalIsoDateSchema, optionalObjectIdSchema, positiveMoneyIntSchema, rejectMongoOperators } from "./common.validation";

export const createInvoiceSchema = z
  .object({
    customerId: objectIdSchema,
    projectId: optionalObjectIdSchema,
    amount: positiveMoneyIntSchema,
    dueDate: optionalIsoDateSchema,
    issueDate: optionalIsoDateSchema,
    description: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateInvoiceSchema = z
  .object({
    description: z.string().trim().max(4000).optional(),
    dueDate: optionalIsoDateSchema,
    status: z.enum(["CANCELLED"]).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const recordInvoicePaymentSchema = z
  .object({
    amount: positiveMoneyIntSchema,
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const listInvoicesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(80).optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    customerId: objectIdSchema.optional(),
    projectId: objectIdSchema.optional(),
  })
  .strict();

export const createVendorSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().max(20).optional(),
    email: z.union([z.string().trim().email().max(160), z.literal("")]).optional(),
    location: z.string().trim().max(160).optional(),
    taxIdentifier: z.string().trim().max(32).optional(),
    status: z.enum(VENDOR_STATUSES).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateVendorSchema = createVendorSchema.partial();

export const listVendorsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(80).optional(),
    status: z.enum(VENDOR_STATUSES).optional(),
    location: z.string().trim().max(160).optional(),
  })
  .strict();

export const createLandParcelSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    location: z.string().trim().max(160).optional(),
    areaNote: z.string().trim().max(400).optional(),
    ownerName: z.string().trim().max(160).optional(),
    askingPrice: moneyIntSchema.optional(),
    status: z.enum(LAND_PARCEL_STATUSES).optional(),
    projectId: optionalObjectIdSchema,
    notes: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateLandParcelSchema = createLandParcelSchema.partial();

export const listLandParcelsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(80).optional(),
    status: z.enum(LAND_PARCEL_STATUSES).optional(),
    location: z.string().trim().max(160).optional(),
  })
  .strict();

export const createMdNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
    relatedType: z.enum(MD_NOTE_RELATED_TYPES).optional(),
    relatedId: optionalObjectIdSchema,
  })
  .strict()
  .superRefine(rejectMongoOperators);

export const updateMdNoteSchema = createMdNoteSchema.partial();

export const listMdNotesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(80).optional(),
    relatedType: z.enum(MD_NOTE_RELATED_TYPES).optional(),
    relatedId: objectIdSchema.optional(),
  })
  .strict();
