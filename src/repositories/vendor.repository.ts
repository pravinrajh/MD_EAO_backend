import type { FilterQuery } from "mongoose";
import { Vendor, type VendorDocument } from "../models/Vendor";
import { VENDOR_SAFE_FIELDS, type VendorStatus } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";
import { createdByScope, stringifyOfficeIds, toPublicDoc } from "./office.common";

export type VendorListFilters = {
  search?: string;
  status?: VendorStatus;
  location?: string;
  scope?: Record<string, unknown>;
  skip: number;
  limit: number;
};

function buildFilter(filters: VendorListFilters): FilterQuery<VendorDocument> {
  const query: FilterQuery<VendorDocument> = { isDeleted: false };
  const and: FilterQuery<VendorDocument>[] = [];
  const scoped = createdByScope(filters.scope);
  if (Object.keys(scoped).length) and.push(scoped);
  if (filters.status) query.status = filters.status;
  if (filters.location) query.location = { $regex: escapeRegex(filters.location), $options: "i" };
  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { name: { $regex: term, $options: "i" } },
        { vendorId: { $regex: `^${term}`, $options: "i" } },
        { location: { $regex: term, $options: "i" } },
      ],
    });
  }
  if (and.length) query.$and = and;
  return query;
}

export const vendorRepository = {
  create(data: Record<string, unknown>) {
    return Vendor.create(data);
  },
  findById(id: string) {
    return Vendor.findById(id).select(VENDOR_SAFE_FIELDS);
  },
  async list(filters: VendorListFilters) {
    const query = buildFilter(filters);
    const [items, total] = await Promise.all([
      Vendor.find(query).select(VENDOR_SAFE_FIELDS).sort({ createdAt: -1 }).skip(filters.skip).limit(filters.limit).lean(),
      Vendor.countDocuments(query),
    ]);
    return { items: items.map((item) => stringifyOfficeIds({ ...item })), total };
  },
  updateById(id: string, patch: Record<string, unknown>) {
    return Vendor.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(VENDOR_SAFE_FIELDS);
  },
  toPublic(doc: VendorDocument | Record<string, unknown>) {
    return toPublicDoc(doc);
  },
};
