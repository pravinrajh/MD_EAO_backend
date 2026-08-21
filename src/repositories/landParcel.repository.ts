import type { FilterQuery } from "mongoose";
import { LandParcel, type LandParcelDocument } from "../models/LandParcel";
import { LAND_PARCEL_SAFE_FIELDS, type LandParcelStatus } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";
import { createdByScope, stringifyOfficeIds, toObjectId, toPublicDoc } from "./office.common";

export type LandParcelListFilters = {
  search?: string;
  status?: LandParcelStatus;
  location?: string;
  scope?: Record<string, unknown>;
  skip: number;
  limit: number;
};

function buildFilter(filters: LandParcelListFilters): FilterQuery<LandParcelDocument> {
  const query: FilterQuery<LandParcelDocument> = { isDeleted: false };
  const and: FilterQuery<LandParcelDocument>[] = [];
  const scoped = createdByScope(filters.scope);
  if (Object.keys(scoped).length) and.push(scoped);
  if (filters.status) query.status = filters.status;
  if (filters.location) query.location = { $regex: escapeRegex(filters.location), $options: "i" };
  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { name: { $regex: term, $options: "i" } },
        { parcelId: { $regex: `^${term}`, $options: "i" } },
        { location: { $regex: term, $options: "i" } },
        { ownerName: { $regex: term, $options: "i" } },
      ],
    });
  }
  if (and.length) query.$and = and;
  return query;
}

export const landParcelRepository = {
  create(data: Record<string, unknown>) {
    return LandParcel.create(data);
  },
  findById(id: string) {
    return LandParcel.findById(id).select(LAND_PARCEL_SAFE_FIELDS);
  },
  async list(filters: LandParcelListFilters) {
    const query = buildFilter(filters);
    const [items, total] = await Promise.all([
      LandParcel.find(query)
        .select(LAND_PARCEL_SAFE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      LandParcel.countDocuments(query),
    ]);
    return { items: items.map((item) => stringifyOfficeIds({ ...item })), total };
  },
  updateById(id: string, patch: Record<string, unknown>) {
    return LandParcel.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(LAND_PARCEL_SAFE_FIELDS);
  },
  toPublic(doc: LandParcelDocument | Record<string, unknown>) {
    return toPublicDoc(doc);
  },
  toObjectId,
};
