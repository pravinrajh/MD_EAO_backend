import mongoose, { type FilterQuery } from "mongoose";
import { Meeting, type MeetingDocument } from "../models/Meeting";
import {
  MAX_CALENDAR_RESULTS,
  MEETING_SAFE_FIELDS,
  type MeetingStatus,
  type MeetingType,
} from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type MeetingSortField = "startTime" | "endTime" | "createdAt" | "title" | "status";

export type MeetingListFilters = {
  search?: string;
  status?: MeetingStatus;
  meetingType?: MeetingType;
  organizerId?: string;
  participantId?: string;
  projectId?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
  startFrom?: Date;
  startToExclusive?: Date;
  overlapStart?: Date;
  overlapEnd?: Date;
  excludeCancelled?: boolean;
  scope?: FilterQuery<MeetingDocument>;
  skip: number;
  limit: number;
  sortBy: MeetingSortField;
  sortOrder: "asc" | "desc";
};

const MEETING_UPDATE_FIELDS = [
  "title",
  "description",
  "meetingType",
  "participants",
  "projectId",
  "customerId",
  "location",
  "startTime",
  "endTime",
  "timezone",
  "status",
  "notes",
  "cancellationReason",
  "cancelledAt",
  "completedAt",
  "isDeleted",
  "deletedAt",
  "deletedBy",
] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of MEETING_UPDATE_FIELDS) {
    if (input[field] !== undefined) {
      update[field] = input[field];
    }
  }
  return update;
}

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.organizerId) record.organizerId = String(record.organizerId);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.projectId) record.projectId = String(record.projectId);
  if (record.customerId) record.customerId = String(record.customerId);
  if (record.deletedBy) record.deletedBy = String(record.deletedBy);
  if (Array.isArray(record.participants)) {
    record.participants = record.participants.map((item) => String(item));
  }
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicMeeting(meeting: MeetingDocument | Record<string, unknown>) {
  const record =
    typeof (meeting as MeetingDocument).toJSON === "function"
      ? ((meeting as MeetingDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(meeting as Record<string, unknown>) });

  if (typeof (meeting as MeetingDocument).toJSON === "function") {
    stringifyIds(record);
  }
  return record;
}

function toObjectId(value: unknown) {
  if (typeof value === "string") return new mongoose.Types.ObjectId(value);
  return value;
}

function buildFilter(filters: MeetingListFilters): FilterQuery<MeetingDocument> {
  const query: FilterQuery<MeetingDocument> = { isDeleted: false };
  const and: FilterQuery<MeetingDocument>[] = [];

  if (filters.scope) and.push(filters.scope);
  if (filters.status) query.status = filters.status;
  if (filters.meetingType) query.meetingType = filters.meetingType;
  if (filters.organizerId) query.organizerId = filters.organizerId;
  if (filters.participantId) query.participants = filters.participantId;
  if (filters.projectId) query.projectId = filters.projectId;
  if (filters.customerId) query.customerId = filters.customerId;
  if (filters.excludeCancelled && !filters.status) query.status = { $ne: "CANCELLED" };

  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = filters.from;
    if (filters.to) range.$lte = filters.to;
    and.push({ startTime: range });
  }

  if (filters.startFrom || filters.startToExclusive) {
    const range: Record<string, Date> = {};
    if (filters.startFrom) range.$gte = filters.startFrom;
    if (filters.startToExclusive) range.$lt = filters.startToExclusive;
    and.push({ startTime: range });
  }

  if (filters.overlapStart && filters.overlapEnd) {
    and.push({ startTime: { $lt: filters.overlapEnd }, endTime: { $gt: filters.overlapStart } });
  }

  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { title: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { location: { $regex: term, $options: "i" } },
        { meetingId: { $regex: `^${term}`, $options: "i" } },
      ],
    });
  }

  if (and.length > 0) query.$and = and;
  return query;
}

export const meetingRepository = {
  findById(id: string) {
    return Meeting.findById(id).select(MEETING_SAFE_FIELDS).lean();
  },

  create(data: Record<string, unknown>) {
    return Meeting.create(data);
  },

  async list(filters: MeetingListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = {
      [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      Meeting.find(query).select(MEETING_SAFE_FIELDS).sort(sort).skip(filters.skip).limit(filters.limit).lean(),
      Meeting.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublicMeeting(item)), total };
  },

  async calendar(filters: Omit<MeetingListFilters, "skip" | "limit">) {
    const query = buildFilter({ ...filters, skip: 0, limit: 0 });
    return Meeting.find(query)
      .select("meetingId title startTime endTime status meetingType projectId")
      .sort({ startTime: 1 })
      .limit(MAX_CALENDAR_RESULTS)
      .lean();
  },

  updateById(id: string, input: Record<string, unknown>) {
    return Meeting.findByIdAndUpdate(id, { $set: pickUpdate(input) }, { new: true, runValidators: true }).select(
      MEETING_SAFE_FIELDS,
    );
  },

  async findConflicts(input: {
    participantIds: string[];
    startTime: Date;
    endTime: Date;
    excludeId?: string;
  }) {
    if (input.participantIds.length === 0) return [];

    const query: FilterQuery<MeetingDocument> = {
      isDeleted: false,
      status: { $ne: "CANCELLED" },
      participants: { $in: input.participantIds.map((id) => new mongoose.Types.ObjectId(id)) },
      startTime: { $lt: input.endTime },
      endTime: { $gt: input.startTime },
    };
    if (input.excludeId) {
      query._id = { $ne: toObjectId(input.excludeId) };
    }

    return Meeting.find(query).select("meetingId participants startTime endTime").lean();
  },

  async counts(scope: FilterQuery<MeetingDocument> | undefined) {
    const match: FilterQuery<MeetingDocument> = { isDeleted: false, ...castScopeForAggregate(scope) };

    const [facet] = await Meeting.aggregate<{
      total: { n: number }[];
      byStatus: { _id: MeetingStatus; n: number }[];
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
      scheduled: byStatus.SCHEDULED ?? 0,
      inProgress: byStatus.IN_PROGRESS ?? 0,
      completed: byStatus.COMPLETED ?? 0,
      cancelled: byStatus.CANCELLED ?? 0,
    };
  },

  toPublic: toPublicMeeting,
};

function castScopeForAggregate(scope: FilterQuery<MeetingDocument> | undefined): FilterQuery<MeetingDocument> {
  if (!scope) return {};
  if (!Array.isArray(scope.$or)) return scope;

  return {
    $or: scope.$or.map((clause) => {
      const next: FilterQuery<MeetingDocument> = { ...clause };
      if (typeof next.organizerId === "string") next.organizerId = toObjectId(next.organizerId);
      if (typeof next.participants === "string") next.participants = toObjectId(next.participants);
      const projectId = next.projectId as { $in?: unknown[] } | string | undefined;
      if (typeof projectId === "string") {
        next.projectId = toObjectId(projectId);
      } else if (projectId && Array.isArray(projectId.$in)) {
        next.projectId = { $in: projectId.$in.map((id) => toObjectId(id)) };
      }
      return next;
    }),
  };
}
