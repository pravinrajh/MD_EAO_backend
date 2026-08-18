import type { FilterQuery } from "mongoose";
import { User, type UserDocument } from "../models/User";
import { USER_SAFE_FIELDS, type Role, type UserStatus } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";

export type UserListFilters = {
  search?: string;
  role?: Role;
  status?: UserStatus;
  skip: number;
  limit: number;
  sortBy: "createdAt" | "name" | "email" | "role";
  sortOrder: "asc" | "desc";
};

const USER_UPDATE_FIELDS = ["name", "phone", "role", "status", "isActive"] as const;

function pickUserUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of USER_UPDATE_FIELDS) {
    if (input[field] !== undefined) {
      update[field] = input[field];
    }
  }
  return update;
}

function toPublic(user: UserDocument | Record<string, unknown>) {
  if (typeof (user as UserDocument).toJSON === "function") {
    return (user as UserDocument).toJSON();
  }

  const record = { ...(user as Record<string, unknown>) };
  record.id = String(record._id ?? record.id);
  delete record._id;
  delete record.__v;
  delete record.passwordHash;
  return record;
}

export const userRepository = {
  count(filter: FilterQuery<UserDocument> = {}) {
    return User.countDocuments(filter);
  },

  findByEmail(email: string, withPassword = false) {
    const query = User.findOne({ email: email.toLowerCase() });
    return withPassword ? query.select("+passwordHash") : query.select(USER_SAFE_FIELDS);
  },

  findById(id: string, withPassword = false) {
    const query = User.findById(id);
    return withPassword ? query.select("+passwordHash") : query.select(USER_SAFE_FIELDS);
  },

  findPublicById(id: string) {
    return User.findById(id).select(USER_SAFE_FIELDS).lean();
  },

  findSummariesByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return User.find({ _id: { $in: ids } }).select("name email role").lean();
  },

  create(data: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    role: Role;
    status?: UserStatus;
  }) {
    return User.create(data);
  },

  async list(filters: UserListFilters) {
    const query: FilterQuery<UserDocument> = {};

    if (filters.role) query.role = filters.role;
    if (filters.status) query.status = filters.status;

    // Bounded regex search on indexed/selective fields. Input is escaped and capped at 50 chars.
    // Leading-wildcard name/phone scans cannot use a B-tree index; email uses a prefix regex.
    // Replace with Atlas Search later without changing the API contract.
    if (filters.search) {
      const term = escapeRegex(filters.search);
      query.$or = [
        { name: { $regex: term, $options: "i" } },
        { email: { $regex: `^${term}`, $options: "i" } },
        { phone: { $regex: term } },
      ];
    }

    const sort: Record<string, 1 | -1> = {
      [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      User.find(query)
        .select(USER_SAFE_FIELDS)
        .sort(sort)
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublic(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>) {
    const update = pickUserUpdate(input);
    return User.findByIdAndUpdate(
      id,
      { $set: update },
      {
        new: true,
        runValidators: true,
      },
    ).select(USER_SAFE_FIELDS);
  },

  toPublic,
};
