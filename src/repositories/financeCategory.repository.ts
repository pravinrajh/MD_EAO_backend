import type { ClientSession, FilterQuery } from "mongoose";
import { FinanceCategory, type FinanceCategoryDocument } from "../models/FinanceCategory";
import {
  FINANCE_CATEGORY_SAFE_FIELDS,
  type FinanceCategoryStatus,
  type FinanceCategoryType,
} from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type CategorySortField = "name" | "code" | "createdAt" | "type";

export type CategoryListFilters = {
  search?: string;
  type?: FinanceCategoryType;
  status?: FinanceCategoryStatus;
  skip: number;
  limit: number;
  sortBy: CategorySortField;
  sortOrder: "asc" | "desc";
};

const CATEGORY_UPDATE_FIELDS = ["name", "description", "status", "type", "isDeleted", "deletedAt", "deletedBy"] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of CATEGORY_UPDATE_FIELDS) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  return update;
}

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.deletedBy) record.deletedBy = String(record.deletedBy);
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicCategory(category: FinanceCategoryDocument | Record<string, unknown>) {
  const record =
    typeof (category as FinanceCategoryDocument).toJSON === "function"
      ? ((category as FinanceCategoryDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(category as Record<string, unknown>) });
  if (typeof (category as FinanceCategoryDocument).toJSON === "function") stringifyIds(record);
  return record;
}

function buildFilter(filters: CategoryListFilters): FilterQuery<FinanceCategoryDocument> {
  const query: FilterQuery<FinanceCategoryDocument> = { isDeleted: false };
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    const term = escapeRegex(filters.search);
    query.$or = [
      { name: { $regex: term, $options: "i" } },
      { description: { $regex: term, $options: "i" } },
      { code: { $regex: `^${term}`, $options: "i" } },
      { categoryId: { $regex: `^${term}`, $options: "i" } },
    ];
  }
  return query;
}

export const financeCategoryRepository = {
  findById(id: string, session?: ClientSession | null) {
    const query = FinanceCategory.findById(id).select(FINANCE_CATEGORY_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  findByCode(code: string) {
    return FinanceCategory.findOne({ code: code.toUpperCase(), isDeleted: false })
      .select(FINANCE_CATEGORY_SAFE_FIELDS)
      .lean();
  },

  findSummariesByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return FinanceCategory.find({ _id: { $in: ids } }).select("name code categoryId type status").lean();
  },

  create(data: Record<string, unknown>, session?: ClientSession | null) {
    if (session) return FinanceCategory.create([data], { session }).then((docs) => docs[0]);
    return FinanceCategory.create(data);
  },

  async list(filters: CategoryListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 };
    const [items, total] = await Promise.all([
      FinanceCategory.find(query)
        .select(FINANCE_CATEGORY_SAFE_FIELDS)
        .sort(sort)
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      FinanceCategory.countDocuments(query),
    ]);
    return { items: items.map((item) => toPublicCategory(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>) {
    return FinanceCategory.findByIdAndUpdate(id, { $set: pickUpdate(input) }, {
      new: true,
      runValidators: true,
    }).select(FINANCE_CATEGORY_SAFE_FIELDS);
  },

  toPublic: toPublicCategory,
};
