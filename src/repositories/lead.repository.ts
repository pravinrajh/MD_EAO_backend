import mongoose, { type ClientSession, type FilterQuery } from "mongoose";
import { Lead, type LeadDocument } from "../models/Lead";
import { LEAD_SAFE_FIELDS, type LeadPriority, type LeadSource, type LeadStatus } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type LeadSortField =
  | "createdAt"
  | "expectedCloseDate"
  | "nextFollowUpAt"
  | "estimatedValue"
  | "name"
  | "status";

export type LeadListFilters = {
  search?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
  assignedTo?: string;
  from?: Date;
  to?: Date;
  followUpFrom?: Date;
  followUpTo?: Date;
  scope?: FilterQuery<LeadDocument>;
  skip: number;
  limit: number;
  sortBy: LeadSortField;
  sortOrder: "asc" | "desc";
};

const LEAD_UPDATE_FIELDS = [
  "name",
  "companyName",
  "email",
  "phone",
  "alternatePhone",
  "source",
  "industry",
  "location",
  "description",
  "assignedTo",
  "status",
  "priority",
  "estimatedValue",
  "expectedCloseDate",
  "nextFollowUpAt",
  "convertedAt",
  "convertedCustomerId",
  "convertedOpportunityId",
  "emailNormalized",
  "phoneNormalized",
  "companyNameNormalized",
  "isDeleted",
  "deletedAt",
  "deletedBy",
] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of LEAD_UPDATE_FIELDS) {
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
  if (record.assignedTo) record.assignedTo = String(record.assignedTo);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.convertedCustomerId) record.convertedCustomerId = String(record.convertedCustomerId);
  if (record.convertedOpportunityId) record.convertedOpportunityId = String(record.convertedOpportunityId);
  if (record.deletedBy) record.deletedBy = String(record.deletedBy);
  delete record._id;
  delete record.__v;
  delete record.emailNormalized;
  delete record.phoneNormalized;
  delete record.companyNameNormalized;
  return record;
}

export function toPublicLead(lead: LeadDocument | Record<string, unknown>) {
  const record =
    typeof (lead as LeadDocument).toJSON === "function"
      ? ((lead as LeadDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(lead as Record<string, unknown>) });
  if (typeof (lead as LeadDocument).toJSON === "function") stringifyIds(record);
  return record;
}

function castScope(scope: FilterQuery<LeadDocument> | undefined): FilterQuery<LeadDocument> {
  if (!scope) return {};
  if (!Array.isArray(scope.$or)) return scope;
  return {
    $or: scope.$or.map((clause) => {
      const next: FilterQuery<LeadDocument> = { ...clause };
      if (typeof next.createdBy === "string") next.createdBy = toObjectId(next.createdBy);
      const assigned = next.assignedTo as { $in?: unknown[] } | string | undefined;
      if (typeof assigned === "string") next.assignedTo = toObjectId(assigned);
      else if (assigned && Array.isArray(assigned.$in)) {
        next.assignedTo = { $in: assigned.$in.map((id) => toObjectId(id)) };
      }
      return next;
    }),
  };
}

function buildFilter(filters: LeadListFilters): FilterQuery<LeadDocument> {
  const query: FilterQuery<LeadDocument> = { isDeleted: false };
  const and: FilterQuery<LeadDocument>[] = [];

  if (filters.scope) and.push(castScope(filters.scope));
  if (filters.status) query.status = filters.status;
  if (filters.priority) query.priority = filters.priority;
  if (filters.source) query.source = filters.source;
  if (filters.assignedTo) query.assignedTo = filters.assignedTo;

  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = filters.from;
    if (filters.to) range.$lte = filters.to;
    and.push({ createdAt: range });
  }

  if (filters.followUpFrom || filters.followUpTo) {
    const range: Record<string, Date> = {};
    if (filters.followUpFrom) range.$gte = filters.followUpFrom;
    if (filters.followUpTo) range.$lte = filters.followUpTo;
    and.push({ nextFollowUpAt: range });
  }

  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { name: { $regex: term, $options: "i" } },
        { companyName: { $regex: term, $options: "i" } },
        { location: { $regex: term, $options: "i" } },
        { email: { $regex: `^${term}`, $options: "i" } },
        { phone: { $regex: term } },
        { leadId: { $regex: `^${term}`, $options: "i" } },
      ],
    });
  }

  if (and.length > 0) query.$and = and;
  return query;
}

export const leadRepository = {
  findById(id: string, session?: ClientSession | null) {
    const query = Lead.findById(id).select(LEAD_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  create(data: Record<string, unknown>, session?: ClientSession | null) {
    if (session) return Lead.create([data], { session }).then((docs) => docs[0]);
    return Lead.create(data);
  },

  async list(filters: LeadListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 };
    const [items, total] = await Promise.all([
      Lead.find(query).select(LEAD_SAFE_FIELDS).sort(sort).skip(filters.skip).limit(filters.limit).lean(),
      Lead.countDocuments(query),
    ]);
    return { items: items.map((item) => toPublicLead(item)), total };
  },

  async explainList(filters: LeadListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 };
    return Lead.find(query).select(LEAD_SAFE_FIELDS).sort(sort).skip(filters.skip).limit(filters.limit).lean().explain("queryPlanner");
  },

  updateById(id: string, input: Record<string, unknown>, session?: ClientSession | null) {
    return Lead.findByIdAndUpdate(id, { $set: pickUpdate(input) }, {
      new: true,
      runValidators: true,
      ...(session ? { session } : {}),
    }).select(LEAD_SAFE_FIELDS);
  },

  findDuplicate(input: {
    emailNormalized?: string;
    phoneNormalized?: string;
    excludeId?: string;
    session?: ClientSession | null;
  }) {
    const or: FilterQuery<LeadDocument>[] = [];
    if (input.emailNormalized) or.push({ emailNormalized: input.emailNormalized });
    if (input.phoneNormalized) or.push({ phoneNormalized: input.phoneNormalized });
    if (or.length === 0) return Promise.resolve(null);

    const query: FilterQuery<LeadDocument> = { isDeleted: false, $or: or };
    if (input.excludeId) query._id = { $ne: toObjectId(input.excludeId) };
    const finder = Lead.findOne(query).select(LEAD_SAFE_FIELDS).lean();
    if (input.session) finder.session(input.session);
    return finder;
  },

  async counts(scope: FilterQuery<LeadDocument> | undefined) {
    const match: FilterQuery<LeadDocument> = { isDeleted: false, ...castScope(scope) };
    const [facet] = await Lead.aggregate<{
      total: { n: number }[];
      byStatus: { _id: LeadStatus; n: number }[];
    }>([
      { $match: match },
      {
        $facet: {
          total: [{ $count: "n" }],
          byStatus: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
        },
      },
    ]);
    const byStatus = Object.fromEntries((facet?.byStatus ?? []).map((row) => [row._id, row.n]));
    return {
      total: facet?.total[0]?.n ?? 0,
      new: byStatus.NEW ?? 0,
      contacted: byStatus.CONTACTED ?? 0,
      qualified: byStatus.QUALIFIED ?? 0,
      unqualified: byStatus.UNQUALIFIED ?? 0,
      converted: byStatus.CONVERTED ?? 0,
      lost: byStatus.LOST ?? 0,
    };
  },

  toPublic: toPublicLead,
};
