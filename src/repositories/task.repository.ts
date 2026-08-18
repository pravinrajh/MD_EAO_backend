import mongoose, { type FilterQuery } from "mongoose";
import { Task, type TaskDocument } from "../models/Task";
import {
  OPEN_TASK_STATUSES,
  TASK_SAFE_FIELDS,
  type TaskPriority,
  type TaskStatus,
} from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type TaskSortField = "createdAt" | "dueDate" | "priority" | "status" | "taskId" | "title";

export type TaskListFilters = {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  createdBy?: string;
  projectId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  dueStart?: Date;
  dueEndExclusive?: Date;
  overdue?: boolean;
  includeDeleted?: boolean;
  scope?: FilterQuery<TaskDocument>;
  skip: number;
  limit: number;
  sortBy: TaskSortField;
  sortOrder: "asc" | "desc";
};

const TASK_UPDATE_FIELDS = [
  "title",
  "description",
  "assignedTo",
  "projectId",
  "priority",
  "dueDate",
  "reminderAt",
  "status",
  "startedAt",
  "completedAt",
  "cancelledAt",
  "completionNote",
  "cancellationReason",
  "isDeleted",
  "deletedAt",
  "deletedBy",
] as const;

export function isTaskOverdue(
  task: { status: string; dueDate?: Date | string | null },
  now = new Date(),
): boolean {
  if (!task.dueDate) return false;
  if (task.status === "COMPLETED" || task.status === "CANCELLED") return false;
  return new Date(task.dueDate).getTime() < now.getTime();
}

function pickTaskUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of TASK_UPDATE_FIELDS) {
    if (input[field] !== undefined) {
      update[field] = input[field];
    }
  }
  return update;
}

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.assignedTo) record.assignedTo = String(record.assignedTo);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.projectId) record.projectId = String(record.projectId);
  if (record.deletedBy) record.deletedBy = String(record.deletedBy);
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicTask(task: TaskDocument | Record<string, unknown>, now = new Date()) {
  const record =
    typeof (task as TaskDocument).toJSON === "function"
      ? ((task as TaskDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(task as Record<string, unknown>) });

  if (typeof (task as TaskDocument).toJSON === "function") {
    stringifyIds(record);
  }

  record.isOverdue = isTaskOverdue(
    { status: String(record.status), dueDate: record.dueDate as Date | null },
    now,
  );
  return record;
}

function overdueMatch(now: Date): FilterQuery<TaskDocument> {
  return {
    status: { $in: OPEN_TASK_STATUSES },
    dueDate: { $ne: null, $lt: now },
  };
}

function buildFilter(filters: TaskListFilters, now: Date): FilterQuery<TaskDocument> {
  const query: FilterQuery<TaskDocument> = {};
  const and: FilterQuery<TaskDocument>[] = [];

  if (!filters.includeDeleted) {
    query.isDeleted = false;
  }

  if (filters.scope) and.push(filters.scope);
  if (filters.status) query.status = filters.status;
  if (filters.priority) query.priority = filters.priority;
  if (filters.assignedTo) query.assignedTo = filters.assignedTo;
  if (filters.createdBy) query.createdBy = filters.createdBy;
  if (filters.projectId) query.projectId = filters.projectId;

  const dueDate: Record<string, Date> = {};
  if (filters.dueStart) dueDate.$gte = filters.dueStart;
  if (filters.dueEndExclusive) dueDate.$lt = filters.dueEndExclusive;
  if (filters.dueFrom) dueDate.$gte = filters.dueFrom;
  if (filters.dueTo) dueDate.$lte = filters.dueTo;
  if (Object.keys(dueDate).length > 0) {
    and.push({ dueDate });
  }

  if (filters.overdue) {
    and.push(overdueMatch(now));
  }

  // Bounded regex search. Input is escaped and capped at 50 chars.
  // Prefix match on taskId can use the unique index; title/description scans cannot.
  // Replace with Atlas Search later without changing the API contract.
  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { title: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { taskId: { $regex: `^${term}`, $options: "i" } },
      ],
    });
  }

  if (and.length > 0) {
    query.$and = and;
  }

  return query;
}

export const taskRepository = {
  findById(id: string) {
    return Task.findById(id).select(TASK_SAFE_FIELDS).lean();
  },

  create(data: Record<string, unknown>) {
    return Task.create(data);
  },

  async list(filters: TaskListFilters, now = new Date()) {
    const query = buildFilter(filters, now);
    const sort: Record<string, 1 | -1> = {
      [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      Task.find(query).select(TASK_SAFE_FIELDS).sort(sort).skip(filters.skip).limit(filters.limit).lean(),
      Task.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublicTask(item, now)), total };
  },

  updateById(id: string, input: Record<string, unknown>) {
    const update = pickTaskUpdate(input);
    return Task.findByIdAndUpdate(
      id,
      { $set: update },
      {
        new: true,
        runValidators: true,
      },
    ).select(TASK_SAFE_FIELDS);
  },

  async counts(scope: FilterQuery<TaskDocument> | undefined, now = new Date()) {
    const match: FilterQuery<TaskDocument> = { isDeleted: false, ...(scope ?? {}) };
    if (typeof match.projectId === "string") {
      match.projectId = new mongoose.Types.ObjectId(match.projectId);
    }

    const [facet] = await Task.aggregate<{
      total: { n: number }[];
      byStatus: { _id: TaskStatus; n: number }[];
      overdue: { n: number }[];
    }>([
      { $match: match },
      {
        $facet: {
          total: [{ $count: "n" }],
          byStatus: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
          overdue: [{ $match: overdueMatch(now) }, { $count: "n" }],
        },
      },
    ]);

    const byStatus = Object.fromEntries((facet?.byStatus ?? []).map((row) => [row._id, row.n]));

    return {
      total: facet?.total[0]?.n ?? 0,
      pending: byStatus.PENDING ?? 0,
      inProgress: byStatus.IN_PROGRESS ?? 0,
      completed: byStatus.COMPLETED ?? 0,
      cancelled: byStatus.CANCELLED ?? 0,
      overdue: facet?.overdue[0]?.n ?? 0,
    };
  },

  toPublic: toPublicTask,
  buildFilter,
};
