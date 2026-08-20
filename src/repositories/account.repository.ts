import { type ClientSession, type FilterQuery } from "mongoose";
import { Account, type AccountDocument } from "../models/Account";
import { ACCOUNT_SAFE_FIELDS, type AccountStatus, type AccountType } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type AccountSortField = "name" | "code" | "createdAt" | "type" | "currentBalance";

export type AccountListFilters = {
  search?: string;
  type?: AccountType;
  status?: AccountStatus;
  skip: number;
  limit: number;
  sortBy: AccountSortField;
  sortOrder: "asc" | "desc";
};

const ACCOUNT_UPDATE_FIELDS = ["name", "description", "status", "isDeleted", "deletedAt", "deletedBy"] as const;

function pickUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of ACCOUNT_UPDATE_FIELDS) {
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

export function toPublicAccount(account: AccountDocument | Record<string, unknown>) {
  const record =
    typeof (account as AccountDocument).toJSON === "function"
      ? ((account as AccountDocument).toJSON() as Record<string, unknown>)
      : stringifyIds({ ...(account as Record<string, unknown>) });
  if (typeof (account as AccountDocument).toJSON === "function") stringifyIds(record);
  return record;
}

function buildFilter(filters: AccountListFilters): FilterQuery<AccountDocument> {
  const query: FilterQuery<AccountDocument> = { isDeleted: false };
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    const term = escapeRegex(filters.search);
    query.$or = [
      { name: { $regex: term, $options: "i" } },
      { description: { $regex: term, $options: "i" } },
      { code: { $regex: `^${term}`, $options: "i" } },
      { accountId: { $regex: `^${term}`, $options: "i" } },
    ];
  }
  return query;
}

export const accountRepository = {
  findById(id: string, session?: ClientSession | null) {
    const query = Account.findById(id).select(ACCOUNT_SAFE_FIELDS).lean();
    if (session) query.session(session);
    return query;
  },

  findByCode(code: string) {
    return Account.findOne({ code: code.toUpperCase(), isDeleted: false }).select(ACCOUNT_SAFE_FIELDS).lean();
  },

  findSummariesByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return Account.find({ _id: { $in: ids } }).select("name code accountId type currentBalance currency status").lean();
  },

  create(data: Record<string, unknown>, session?: ClientSession | null) {
    if (session) return Account.create([data], { session }).then((docs) => docs[0]);
    return Account.create(data);
  },

  async list(filters: AccountListFilters) {
    const query = buildFilter(filters);
    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 };
    const [items, total] = await Promise.all([
      Account.find(query).select(ACCOUNT_SAFE_FIELDS).sort(sort).skip(filters.skip).limit(filters.limit).lean(),
      Account.countDocuments(query),
    ]);
    return { items: items.map((item) => toPublicAccount(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>) {
    return Account.findByIdAndUpdate(id, { $set: pickUpdate(input) }, { new: true, runValidators: true }).select(
      ACCOUNT_SAFE_FIELDS,
    );
  },

  adjustBalance(id: string, delta: number, session?: ClientSession | null) {
    const filter: FilterQuery<AccountDocument> = { _id: id, isDeleted: false, status: "ACTIVE" };
    if (delta < 0) {
      filter.currentBalance = { $gte: -delta };
    }
    return Account.findOneAndUpdate(filter, { $inc: { currentBalance: delta } }, {
      new: true,
      ...(session ? { session } : {}),
    }).select(ACCOUNT_SAFE_FIELDS);
  },

  async explainList(filters: AccountListFilters) {
    const query = buildFilter(filters);
    return Account.find(query)
      .select(ACCOUNT_SAFE_FIELDS)
      .sort({ [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean()
      .explain("queryPlanner");
  },

  toPublic: toPublicAccount,
};
