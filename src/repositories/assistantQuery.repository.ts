import type { FilterQuery } from "mongoose";
import { AssistantQuery, type AssistantQueryDocument } from "../models/AssistantQuery";
import { ASSISTANT_SAFE_FIELDS } from "../utils/constants";

export type AssistantQueryListFilters = {
  userId: string;
  conversationId?: string;
  skip: number;
  limit: number;
};

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  delete record._id;
  delete record.__v;
  return record;
}

function toPublic(doc: AssistantQueryDocument | Record<string, unknown>) {
  if (typeof (doc as AssistantQueryDocument).toJSON === "function") {
    const record = (doc as AssistantQueryDocument).toJSON() as Record<string, unknown>;
    stringifyIds(record);
    return record;
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

export const assistantQueryRepository = {
  create(data: Record<string, unknown>) {
    return AssistantQuery.create(data);
  },

  async list(filters: AssistantQueryListFilters) {
    const query: FilterQuery<AssistantQueryDocument> = { userId: filters.userId };
    if (filters.conversationId) query.conversationId = filters.conversationId;

    const [items, total] = await Promise.all([
      AssistantQuery.find(query)
        .select(ASSISTANT_SAFE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      AssistantQuery.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublic(item)), total };
  },

  toPublic,
};
