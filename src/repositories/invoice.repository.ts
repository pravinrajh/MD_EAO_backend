import type { FilterQuery } from "mongoose";
import { Invoice, type InvoiceDocument } from "../models/Invoice";
import { InvoicePayment } from "../models/InvoicePayment";
import { INVOICE_PAYMENT_SAFE_FIELDS, INVOICE_SAFE_FIELDS, type InvoiceStatus } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";
import { createdByScope, stringifyOfficeIds, toObjectId, toPublicDoc } from "./office.common";

export type InvoiceListFilters = {
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  projectId?: string;
  scope?: Record<string, unknown>;
  skip: number;
  limit: number;
};

function buildFilter(filters: InvoiceListFilters): FilterQuery<InvoiceDocument> {
  const query: FilterQuery<InvoiceDocument> = { isDeleted: false };
  const and: FilterQuery<InvoiceDocument>[] = [];
  const scoped = createdByScope(filters.scope);
  if (Object.keys(scoped).length) and.push(scoped);
  if (filters.status) query.status = filters.status;
  if (filters.customerId) query.customerId = toObjectId(filters.customerId) as InvoiceDocument["customerId"];
  if (filters.projectId) query.projectId = toObjectId(filters.projectId) as InvoiceDocument["projectId"];
  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { invoiceNumber: { $regex: `^${term}`, $options: "i" } },
        { invoiceId: { $regex: `^${term}`, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
      ],
    });
  }
  if (and.length) query.$and = and;
  return query;
}

export const invoiceRepository = {
  create(data: Record<string, unknown>) {
    return Invoice.create(data);
  },
  findById(id: string) {
    return Invoice.findById(id).select(INVOICE_SAFE_FIELDS);
  },
  async list(filters: InvoiceListFilters) {
    const query = buildFilter(filters);
    const [items, total] = await Promise.all([
      Invoice.find(query).select(INVOICE_SAFE_FIELDS).sort({ createdAt: -1 }).skip(filters.skip).limit(filters.limit).lean(),
      Invoice.countDocuments(query),
    ]);
    return { items: items.map((item) => stringifyOfficeIds({ ...item })), total };
  },
  updateById(id: string, patch: Record<string, unknown>) {
    return Invoice.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(INVOICE_SAFE_FIELDS);
  },
  createPayment(data: Record<string, unknown>) {
    return InvoicePayment.create(data);
  },
  listPayments(invoiceId: string) {
    return InvoicePayment.find({ invoiceId }).select(INVOICE_PAYMENT_SAFE_FIELDS).sort({ createdAt: -1 }).lean();
  },
  toPublic(doc: InvoiceDocument | Record<string, unknown>) {
    return toPublicDoc(doc);
  },
  toPublicPayment(doc: Record<string, unknown>) {
    return stringifyOfficeIds({ ...doc });
  },
};
