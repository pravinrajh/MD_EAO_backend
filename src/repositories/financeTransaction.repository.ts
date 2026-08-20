import mongoose, { type ClientSession, type FilterQuery } from "mongoose";
import { FinanceTransaction, type FinanceTransactionDocument } from "../models/FinanceTransaction";
import {
  FINANCE_TRANSACTION_SAFE_FIELDS,
  type FinanceTransactionStatus,
  type FinanceTransactionType,
  type PaymentMethod,
} from "../utils/constants";
import { env } from "../config/env";

export type TransactionSortField = "transactionDate" | "createdAt" | "amount" | "status" | "type";

export type TransactionListFilters = {
  type?: FinanceTransactionType;
  status?: FinanceTransactionStatus;
  accountId?: string;
  categoryId?: string;
  projectId?: string;
  customerId?: string;
  opportunityId?: string;
  paymentMethod?: PaymentMethod;
  from?: Date;
  to?: Date;
  scope?: FilterQuery<FinanceTransactionDocument>;
  skip: number;
  limit: number;
  sortBy: TransactionSortField;
  sortOrder: "asc" | "desc";
};

const TRANSACTION_UPDATE_FIELDS = ["status", "isDeleted", "deletedAt", "deletedBy"] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of TRANSACTION_UPDATE_FIELDS) {
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
  for (const field of [
    "accountId",
    "counterpartyAccountId",
    "categoryId",
    "projectId",
    "customerId",
    "opportunityId",
    "createdBy",
    "deletedBy",
  ]) {
    if (record[field]) record[field] = String(record[field]);
  }
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicTransaction(txn: FinanceTransactionDocument | Record<string, unknown>) {
  const record =
    typeof (txn as FinanceTransactionDocument).toJSON === "function"
      ? ((txn as FinanceTransactionDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(txn as Record<string, unknown>) });
  if (typeof (txn as FinanceTransactionDocument).toJSON === "function") stringifyIds(record);
  return record;
}

function castScope(scope: FilterQuery<FinanceTransactionDocument> | undefined) {
  if (!scope) return {};
  if (!Array.isArray(scope.$or)) {
    const next: FilterQuery<FinanceTransactionDocument> = { ...scope };
    if (typeof next.createdBy === "string") next.createdBy = toObjectId(next.createdBy);
    if (typeof next.projectId === "string") next.projectId = toObjectId(next.projectId);
    return next;
  }
  return {
    $or: scope.$or.map((clause) => {
      const next: FilterQuery<FinanceTransactionDocument> = { ...clause };
      if (typeof next.createdBy === "string") next.createdBy = toObjectId(next.createdBy);
      const projectId = next.projectId as { $in?: unknown[] } | string | undefined;
      if (typeof projectId === "string") next.projectId = toObjectId(projectId);
      else if (projectId && Array.isArray(projectId.$in)) {
        next.projectId = { $in: projectId.$in.map((id) => toObjectId(id)) };
      }
      return next;
    }),
  };
}

function buildFilter(filters: TransactionListFilters): FilterQuery<FinanceTransactionDocument> {
  const query: FilterQuery<FinanceTransactionDocument> = { isDeleted: false };
  const and: FilterQuery<FinanceTransactionDocument>[] = [];

  if (filters.scope) and.push(castScope(filters.scope));
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.projectId) query.projectId = filters.projectId;
  if (filters.customerId) query.customerId = filters.customerId;
  if (filters.opportunityId) query.opportunityId = filters.opportunityId;
  if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
  if (filters.accountId) {
    and.push({
      $or: [{ accountId: toObjectId(filters.accountId) }, { counterpartyAccountId: toObjectId(filters.accountId) }],
    });
  }
  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = filters.from;
    if (filters.to) range.$lte = filters.to;
    and.push({ transactionDate: range });
  }
  if (and.length > 0) query.$and = and;
  return query;
}

function completedMatch(extra: FilterQuery<FinanceTransactionDocument> = {}) {
  return { isDeleted: false, status: "COMPLETED" as const, ...extra };
}

export const financeTransactionRepository = {
  findById(id: string, session?: ClientSession | null) {
    const query = FinanceTransaction.findById(id).select(FINANCE_TRANSACTION_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  findByIdempotencyKey(key: string, session?: ClientSession | null) {
    const query = FinanceTransaction.findOne({ idempotencyKey: key }).select(FINANCE_TRANSACTION_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  countByCategoryId(categoryId: string) {
    return FinanceTransaction.countDocuments({ categoryId, isDeleted: false });
  },

  create(data: Record<string, unknown>, session?: ClientSession | null) {
    if (session) return FinanceTransaction.create([data], { session }).then((docs) => docs[0]);
    return FinanceTransaction.create(data);
  },

  async list(filters: TransactionListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 };
    const [items, total] = await Promise.all([
      FinanceTransaction.find(query)
        .select(FINANCE_TRANSACTION_SAFE_FIELDS)
        .sort(sort)
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      FinanceTransaction.countDocuments(query),
    ]);
    return { items: items.map((item) => toPublicTransaction(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>, session?: ClientSession | null) {
    return FinanceTransaction.findByIdAndUpdate(id, { $set: pickUpdate(input) }, {
      new: true,
      runValidators: true,
      ...(session ? { session } : {}),
    }).select(FINANCE_TRANSACTION_SAFE_FIELDS);
  },

  claimPending(id: string, nextStatus: FinanceTransactionStatus, session?: ClientSession | null) {
    return FinanceTransaction.findOneAndUpdate(
      { _id: id, status: "PENDING", isDeleted: false },
      { $set: { status: nextStatus } },
      { new: true, ...(session ? { session } : {}) },
    ).select(FINANCE_TRANSACTION_SAFE_FIELDS);
  },

  async summarize(match: FilterQuery<FinanceTransactionDocument>) {
    const [row] = await FinanceTransaction.aggregate<{
      income: number;
      expense: number;
      transactionCount: number;
      incomeTransactionCount: number;
      expenseTransactionCount: number;
    }>([
      { $match: { ...completedMatch(), ...match } },
      {
        $group: {
          _id: null,
          income: { $sum: { $cond: [{ $eq: ["$type", "INCOME"] }, "$amount", 0] } },
          expense: { $sum: { $cond: [{ $eq: ["$type", "EXPENSE"] }, "$amount", 0] } },
          transactionCount: {
            $sum: { $cond: [{ $in: ["$type", ["INCOME", "EXPENSE"]] }, 1, 0] },
          },
          incomeTransactionCount: { $sum: { $cond: [{ $eq: ["$type", "INCOME"] }, 1, 0] } },
          expenseTransactionCount: { $sum: { $cond: [{ $eq: ["$type", "EXPENSE"] }, 1, 0] } },
        },
      },
    ]);
    return {
      income: row?.income ?? 0,
      expense: row?.expense ?? 0,
      net: (row?.income ?? 0) - (row?.expense ?? 0),
      transactionCount: row?.transactionCount ?? 0,
      incomeTransactionCount: row?.incomeTransactionCount ?? 0,
      expenseTransactionCount: row?.expenseTransactionCount ?? 0,
    };
  },

  async monthly(year: number, match: FilterQuery<FinanceTransactionDocument> = {}) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const rows = await FinanceTransaction.aggregate<{ _id: { month: string }; income: number; expense: number }>([
      {
        $match: {
          ...completedMatch({
            transactionDate: { $gte: start, $lt: end },
            type: { $in: ["INCOME", "EXPENSE"] },
            ...match,
          }),
        },
      },
      {
        $group: {
          _id: {
            month: {
              $dateToString: { format: "%Y-%m", date: "$transactionDate", timezone: env.APP_TIMEZONE },
            },
          },
          income: { $sum: { $cond: [{ $eq: ["$type", "INCOME"] }, "$amount", 0] } },
          expense: { $sum: { $cond: [{ $eq: ["$type", "EXPENSE"] }, "$amount", 0] } },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    const byMonth = Object.fromEntries(rows.map((row) => [row._id.month, row]));
    return Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      const row = byMonth[month];
      const income = row?.income ?? 0;
      const expense = row?.expense ?? 0;
      return { month, income, expense, net: income - expense };
    });
  },

  async expensesByCategory(match: FilterQuery<FinanceTransactionDocument>) {
    return FinanceTransaction.aggregate<{ category: string; amount: number }>([
      { $match: { ...completedMatch({ type: "EXPENSE", ...match }) } },
      { $group: { _id: "$categoryId", amount: { $sum: "$amount" } } },
      {
        $lookup: {
          from: "financecategories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          category: { $ifNull: ["$category.name", "Uncategorized"] },
          amount: 1,
        },
      },
      { $sort: { amount: -1 } },
    ]);
  },

  async expenseTotal(match: FilterQuery<FinanceTransactionDocument>) {
    const [row] = await FinanceTransaction.aggregate<{ amount: number }>([
      { $match: { ...completedMatch({ type: "EXPENSE", ...match }) } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]);
    return row?.amount ?? 0;
  },

  toPublic: toPublicTransaction,
  toObjectId,
};
