import mongoose, { type ClientSession, type FilterQuery } from "mongoose";
import { SalesActivity, type SalesActivityDocument } from "../models/SalesActivity";
import {
  SALES_ACTIVITY_SAFE_FIELDS,
  type SalesActivityStatus,
  type SalesActivityType,
} from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type SalesActivitySortField = "createdAt" | "scheduledAt" | "status" | "type" | "title";

export type SalesActivityListFilters = {
  search?: string;
  leadId?: string;
  customerId?: string;
  opportunityId?: string;
  employeeId?: string;
  type?: SalesActivityType;
  status?: SalesActivityStatus;
  from?: Date;
  to?: Date;
  scope?: FilterQuery<SalesActivityDocument>;
  skip: number;
  limit: number;
  sortBy: SalesActivitySortField;
  sortOrder: "asc" | "desc";
};

const ACTIVITY_UPDATE_FIELDS = [
  "type",
  "title",
  "description",
  "leadId",
  "customerId",
  "opportunityId",
  "employeeId",
  "scheduledAt",
  "completedAt",
  "status",
  "isDeleted",
  "deletedAt",
  "deletedBy",
] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of ACTIVITY_UPDATE_FIELDS) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  return update;
}

function toObjectId(value: unknown) {
  if (typeof value === "string") return new mongoose.Types.ObjectId(value);
  return value;
}

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.leadId) record.leadId = String(record.leadId);
  if (record.customerId) record.customerId = String(record.customerId);
  if (record.opportunityId) record.opportunityId = String(record.opportunityId);
  if (record.employeeId) record.employeeId = String(record.employeeId);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.deletedBy) record.deletedBy = String(record.deletedBy);
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicSalesActivity(activity: SalesActivityDocument | Record<string, unknown>) {
  const record =
    typeof (activity as SalesActivityDocument).toJSON === "function"
      ? ((activity as SalesActivityDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(activity as Record<string, unknown>) });
  if (typeof (activity as SalesActivityDocument).toJSON === "function") stringifyIds(record);
  return record;
}

function castScope(scope: FilterQuery<SalesActivityDocument> | undefined): FilterQuery<SalesActivityDocument> {
  if (!scope) return {};
  if (!Array.isArray(scope.$or)) return scope;
  return {
    $or: scope.$or.map((clause) => {
      const next: FilterQuery<SalesActivityDocument> = { ...clause };
      if (typeof next.createdBy === "string") next.createdBy = toObjectId(next.createdBy);
      const employee = next.employeeId as { $in?: unknown[] } | string | undefined;
      if (typeof employee === "string") next.employeeId = toObjectId(employee);
      else if (employee && Array.isArray(employee.$in)) {
        next.employeeId = { $in: employee.$in.map((id) => toObjectId(id)) };
      }
      return next;
    }),
  };
}

function buildFilter(filters: SalesActivityListFilters): FilterQuery<SalesActivityDocument> {
  const query: FilterQuery<SalesActivityDocument> = { isDeleted: false };
  const and: FilterQuery<SalesActivityDocument>[] = [];

  if (filters.scope) and.push(castScope(filters.scope));
  if (filters.leadId) query.leadId = filters.leadId;
  if (filters.customerId) query.customerId = filters.customerId;
  if (filters.opportunityId) query.opportunityId = filters.opportunityId;
  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;

  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = filters.from;
    if (filters.to) range.$lte = filters.to;
    and.push({ scheduledAt: range });
  }

  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { title: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { activityId: { $regex: `^${term}`, $options: "i" } },
      ],
    });
  }

  if (and.length > 0) query.$and = and;
  return query;
}

export const salesActivityRepository = {
  findById(id: string, session?: ClientSession | null) {
    const query = SalesActivity.findById(id).select(SALES_ACTIVITY_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  create(data: Record<string, unknown>, session?: ClientSession | null) {
    if (session) return SalesActivity.create([data], { session }).then((docs) => docs[0]);
    return SalesActivity.create(data);
  },

  async list(filters: SalesActivityListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 };
    const [items, total] = await Promise.all([
      SalesActivity.find(query)
        .select(SALES_ACTIVITY_SAFE_FIELDS)
        .sort(sort)
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      SalesActivity.countDocuments(query),
    ]);
    return { items: items.map((item) => toPublicSalesActivity(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>, session?: ClientSession | null) {
    return SalesActivity.findByIdAndUpdate(id, { $set: pickUpdate(input) }, {
      new: true,
      runValidators: true,
      ...(session ? { session } : {}),
    }).select(SALES_ACTIVITY_SAFE_FIELDS);
  },

  toPublic: toPublicSalesActivity,
};
