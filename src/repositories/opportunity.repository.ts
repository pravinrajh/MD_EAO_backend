import mongoose, { type ClientSession, type FilterQuery } from "mongoose";
import { Opportunity, type OpportunityDocument } from "../models/Opportunity";
import {
  OPEN_OPPORTUNITY_STAGES,
  OPPORTUNITY_SAFE_FIELDS,
  OPPORTUNITY_STAGES,
  type OpportunityStage,
} from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type OpportunitySortField =
  | "createdAt"
  | "expectedCloseDate"
  | "estimatedValue"
  | "probability"
  | "title"
  | "stage"
  | "nextFollowUpAt";

export type OpportunityListFilters = {
  search?: string;
  stage?: OpportunityStage;
  assignedTo?: string;
  customerId?: string;
  projectId?: string;
  leadId?: string;
  from?: Date;
  to?: Date;
  followUpFrom?: Date;
  followUpTo?: Date;
  minEstimatedValue?: number;
  expectedCloseFrom?: Date;
  expectedCloseTo?: Date;
  scope?: FilterQuery<OpportunityDocument>;
  skip: number;
  limit: number;
  sortBy: OpportunitySortField;
  sortOrder: "asc" | "desc";
};

const OPPORTUNITY_UPDATE_FIELDS = [
  "title",
  "customerId",
  "leadId",
  "projectId",
  "assignedTo",
  "stage",
  "probability",
  "estimatedValue",
  "expectedCloseDate",
  "description",
  "nextFollowUpAt",
  "lostReason",
  "wonAt",
  "lostAt",
  "isDeleted",
  "deletedAt",
  "deletedBy",
] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of OPPORTUNITY_UPDATE_FIELDS) {
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
  if (record.customerId) record.customerId = String(record.customerId);
  if (record.leadId) record.leadId = String(record.leadId);
  if (record.projectId) record.projectId = String(record.projectId);
  if (record.assignedTo) record.assignedTo = String(record.assignedTo);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.deletedBy) record.deletedBy = String(record.deletedBy);
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicOpportunity(opportunity: OpportunityDocument | Record<string, unknown>) {
  const record =
    typeof (opportunity as OpportunityDocument).toJSON === "function"
      ? ((opportunity as OpportunityDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(opportunity as Record<string, unknown>) });
  if (typeof (opportunity as OpportunityDocument).toJSON === "function") stringifyIds(record);
  return record;
}

function castScope(scope: FilterQuery<OpportunityDocument> | undefined): FilterQuery<OpportunityDocument> {
  if (!scope) return {};
  if (!Array.isArray(scope.$or)) return scope;
  return {
    $or: scope.$or.map((clause) => {
      const next: FilterQuery<OpportunityDocument> = { ...clause };
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

function buildFilter(filters: OpportunityListFilters): FilterQuery<OpportunityDocument> {
  const query: FilterQuery<OpportunityDocument> = { isDeleted: false };
  const and: FilterQuery<OpportunityDocument>[] = [];

  if (filters.scope) and.push(castScope(filters.scope));
  if (filters.stage) query.stage = filters.stage;
  if (filters.assignedTo) query.assignedTo = filters.assignedTo;
  if (filters.customerId) query.customerId = filters.customerId;
  if (filters.projectId) query.projectId = filters.projectId;
  if (filters.leadId) query.leadId = filters.leadId;
  if (filters.minEstimatedValue !== undefined) query.estimatedValue = { $gte: filters.minEstimatedValue };

  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = filters.from;
    if (filters.to) range.$lte = filters.to;
    and.push({ expectedCloseDate: range });
  }

  if (filters.expectedCloseFrom || filters.expectedCloseTo) {
    const range: Record<string, Date> = {};
    if (filters.expectedCloseFrom) range.$gte = filters.expectedCloseFrom;
    if (filters.expectedCloseTo) range.$lte = filters.expectedCloseTo;
    and.push({ expectedCloseDate: range });
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
        { title: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { opportunityId: { $regex: `^${term}`, $options: "i" } },
      ],
    });
  }

  if (and.length > 0) query.$and = and;
  return query;
}

export const opportunityRepository = {
  findById(id: string, session?: ClientSession | null) {
    const query = Opportunity.findById(id).select(OPPORTUNITY_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  findByLeadId(leadId: string, session?: ClientSession | null) {
    const query = Opportunity.findOne({ leadId, isDeleted: false }).select(OPPORTUNITY_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  findSummariesByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return Opportunity.find({ _id: { $in: ids }, isDeleted: false })
      .select("title opportunityId stage estimatedValue")
      .lean();
  },

  create(data: Record<string, unknown>, session?: ClientSession | null) {
    if (session) return Opportunity.create([data], { session }).then((docs) => docs[0]);
    return Opportunity.create(data);
  },

  async list(filters: OpportunityListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 };
    const [items, total] = await Promise.all([
      Opportunity.find(query)
        .select(OPPORTUNITY_SAFE_FIELDS)
        .sort(sort)
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      Opportunity.countDocuments(query),
    ]);
    return { items: items.map((item) => toPublicOpportunity(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>, session?: ClientSession | null) {
    return Opportunity.findByIdAndUpdate(id, { $set: pickUpdate(input) }, {
      new: true,
      runValidators: true,
      ...(session ? { session } : {}),
    }).select(OPPORTUNITY_SAFE_FIELDS);
  },

  async pipeline(scope: FilterQuery<OpportunityDocument> | undefined) {
    const match: FilterQuery<OpportunityDocument> = { isDeleted: false, ...castScope(scope) };
    const rows = await Opportunity.aggregate<{ _id: OpportunityStage; count: number; totalValue: number }>([
      { $match: match },
      {
        $group: {
          _id: "$stage",
          count: { $sum: 1 },
          totalValue: { $sum: "$estimatedValue" },
        },
      },
    ]);

    const byStage = Object.fromEntries(rows.map((row) => [row._id, row]));
    const data = Object.fromEntries(
      OPPORTUNITY_STAGES.map((stage) => [
        stage,
        {
          count: byStage[stage]?.count ?? 0,
          totalValue: byStage[stage]?.totalValue ?? 0,
        },
      ]),
    ) as Record<OpportunityStage, { count: number; totalValue: number }>;
    return data;
  },

  async forecast(scope: FilterQuery<OpportunityDocument> | undefined) {
    const match: FilterQuery<OpportunityDocument> = { isDeleted: false, ...castScope(scope) };
    const [row] = await Opportunity.aggregate<{
      pipelineValue: number;
      weightedPipelineValue: number;
      wonValue: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: null,
          pipelineValue: {
            $sum: {
              $cond: [{ $in: ["$stage", OPEN_OPPORTUNITY_STAGES] }, "$estimatedValue", 0],
            },
          },
          weightedPipelineValue: {
            $sum: {
              $cond: [
                { $in: ["$stage", OPEN_OPPORTUNITY_STAGES] },
                {
                  $floor: {
                    $divide: [{ $multiply: ["$estimatedValue", "$probability"] }, 100],
                  },
                },
                0,
              ],
            },
          },
          wonValue: {
            $sum: {
              $cond: [{ $eq: ["$stage", "WON"] }, "$estimatedValue", 0],
            },
          },
        },
      },
    ]);

    return {
      pipelineValue: row?.pipelineValue ?? 0,
      weightedPipelineValue: row?.weightedPipelineValue ?? 0,
      wonValue: row?.wonValue ?? 0,
    };
  },

  async counts(scope: FilterQuery<OpportunityDocument> | undefined) {
    const match: FilterQuery<OpportunityDocument> = { isDeleted: false, ...castScope(scope) };
    const [facet] = await Opportunity.aggregate<{
      total: { n: number }[];
      byStage: { _id: OpportunityStage; n: number }[];
    }>([
      { $match: match },
      {
        $facet: {
          total: [{ $count: "n" }],
          byStage: [{ $group: { _id: "$stage", n: { $sum: 1 } } }],
        },
      },
    ]);
    const byStage = Object.fromEntries((facet?.byStage ?? []).map((row) => [row._id, row.n]));
    const open = OPEN_OPPORTUNITY_STAGES.reduce((sum, stage) => sum + (byStage[stage] ?? 0), 0);
    return {
      total: facet?.total[0]?.n ?? 0,
      open,
      won: byStage.WON ?? 0,
      lost: byStage.LOST ?? 0,
    };
  },

  toPublic: toPublicOpportunity,
};
