import type { ClientSession, FilterQuery } from "mongoose";
import { Budget, type BudgetDocument } from "../models/Budget";
import { BUDGET_SAFE_FIELDS, type BudgetStatus } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type BudgetSortField = "createdAt" | "periodStart" | "periodEnd" | "amount" | "name";

export type BudgetListFilters = {
  search?: string;
  projectId?: string;
  categoryId?: string;
  status?: BudgetStatus;
  scope?: FilterQuery<BudgetDocument>;
  skip: number;
  limit: number;
  sortBy: BudgetSortField;
  sortOrder: "asc" | "desc";
};

const BUDGET_UPDATE_FIELDS = [
  "name",
  "projectId",
  "categoryId",
  "amount",
  "periodStart",
  "periodEnd",
  "status",
  "isDeleted",
  "deletedAt",
  "deletedBy",
] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of BUDGET_UPDATE_FIELDS) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  return update;
}

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.projectId) record.projectId = String(record.projectId);
  if (record.categoryId) record.categoryId = String(record.categoryId);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.deletedBy) record.deletedBy = String(record.deletedBy);
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicBudget(budget: BudgetDocument | Record<string, unknown>) {
  const record =
    typeof (budget as BudgetDocument).toJSON === "function"
      ? ((budget as BudgetDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(budget as Record<string, unknown>) });
  if (typeof (budget as BudgetDocument).toJSON === "function") stringifyIds(record);
  return record;
}

function buildFilter(filters: BudgetListFilters): FilterQuery<BudgetDocument> {
  const query: FilterQuery<BudgetDocument> = { isDeleted: false };
  const and: FilterQuery<BudgetDocument>[] = [];
  if (filters.scope) and.push(filters.scope);
  if (filters.projectId) query.projectId = filters.projectId;
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [
        { name: { $regex: term, $options: "i" } },
        { budgetId: { $regex: `^${term}`, $options: "i" } },
      ],
    });
  }
  if (and.length > 0) query.$and = and;
  return query;
}

export const budgetRepository = {
  findById(id: string, session?: ClientSession | null) {
    const query = Budget.findById(id).select(BUDGET_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  create(data: Record<string, unknown>, session?: ClientSession | null) {
    if (session) return Budget.create([data], { session }).then((docs) => docs[0]);
    return Budget.create(data);
  },

  async list(filters: BudgetListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 };
    const [items, total] = await Promise.all([
      Budget.find(query).select(BUDGET_SAFE_FIELDS).sort(sort).skip(filters.skip).limit(filters.limit).lean(),
      Budget.countDocuments(query),
    ]);
    return { items: items.map((item) => toPublicBudget(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>) {
    return Budget.findByIdAndUpdate(id, { $set: pickUpdate(input) }, { new: true, runValidators: true }).select(
      BUDGET_SAFE_FIELDS,
    );
  },

  toPublic: toPublicBudget,
};
