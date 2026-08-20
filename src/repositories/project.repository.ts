import type { ClientSession, FilterQuery } from "mongoose";
import { Project, type ProjectDocument } from "../models/Project";
import { PROJECT_SAFE_FIELDS, type ProjectStatus, type ProjectType } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type ProjectSortField = "createdAt" | "name" | "status" | "progress" | "startDate" | "expectedEndDate";

export type ProjectListFilters = {
  search?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  managerId?: string;
  customerId?: string;
  location?: string;
  scope?: FilterQuery<ProjectDocument>;
  skip: number;
  limit: number;
  sortBy: ProjectSortField;
  sortOrder: "asc" | "desc";
};

const PROJECT_UPDATE_FIELDS = [
  "name",
  "code",
  "description",
  "location",
  "projectType",
  "managerId",
  "members",
  "customerId",
  "status",
  "progress",
  "budget",
  "startDate",
  "expectedEndDate",
  "completedAt",
  "isDeleted",
  "deletedAt",
  "deletedBy",
] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of PROJECT_UPDATE_FIELDS) {
    if (input[field] !== undefined) {
      update[field] = input[field];
    }
  }
  return update;
}

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.managerId) record.managerId = String(record.managerId);
  if (record.customerId) record.customerId = String(record.customerId);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.deletedBy) record.deletedBy = String(record.deletedBy);
  if (Array.isArray(record.members)) {
    record.members = record.members.map((member) => String(member));
  }
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicProject(project: ProjectDocument | Record<string, unknown>) {
  const record =
    typeof (project as ProjectDocument).toJSON === "function"
      ? ((project as ProjectDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(project as Record<string, unknown>) });

  if (typeof (project as ProjectDocument).toJSON === "function") {
    stringifyIds(record);
  }

  return record;
}

function buildFilter(filters: ProjectListFilters): FilterQuery<ProjectDocument> {
  const query: FilterQuery<ProjectDocument> = { isDeleted: false };
  const and: FilterQuery<ProjectDocument>[] = [];

  if (filters.scope) and.push(filters.scope);
  if (filters.status) query.status = filters.status;
  if (filters.projectType) query.projectType = filters.projectType;
  if (filters.managerId) query.managerId = filters.managerId;
  if (filters.customerId) query.customerId = filters.customerId;
  if (filters.location) query.location = filters.location;

  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { name: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { location: { $regex: term, $options: "i" } },
        { code: { $regex: `^${term}`, $options: "i" } },
        { projectId: { $regex: `^${term}`, $options: "i" } },
      ],
    });
  }

  if (and.length > 0) query.$and = and;
  return query;
}

export const projectRepository = {
  findById(id: string) {
    return Project.findById(id).select(PROJECT_SAFE_FIELDS).lean();
  },

  findSummariesByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return Project.find({ _id: { $in: ids }, isDeleted: false }).select("name projectId status").lean();
  },

  findIdsByManager(managerEmployeeId: string) {
    return Project.find({ managerId: managerEmployeeId, isDeleted: false }).select("_id").lean();
  },

  findByCode(code: string) {
    return Project.findOne({ code: code.toUpperCase(), isDeleted: false }).select(PROJECT_SAFE_FIELDS).lean();
  },

  create(data: Record<string, unknown>) {
    return Project.create(data);
  },

  async list(filters: ProjectListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = {
      [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      Project.find(query).select(PROJECT_SAFE_FIELDS).sort(sort).skip(filters.skip).limit(filters.limit).lean(),
      Project.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublicProject(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>) {
    return Project.findByIdAndUpdate(
      id,
      { $set: pickUpdate(input) },
      {
        new: true,
        runValidators: true,
      },
    ).select(PROJECT_SAFE_FIELDS);
  },

  incrementActualExpense(id: string, delta: number, session?: ClientSession | null) {
    return Project.findByIdAndUpdate(
      id,
      { $inc: { actualExpense: delta } },
      { new: true, ...(session ? { session } : {}) },
    ).select(PROJECT_SAFE_FIELDS);
  },

  findAccessibleIds(employeeId: string) {
    return Project.find({
      isDeleted: false,
      $or: [{ managerId: employeeId }, { members: employeeId }],
    })
      .select("_id")
      .lean();
  },

  toPublic: toPublicProject,
};
