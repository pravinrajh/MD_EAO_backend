import type { FilterQuery } from "mongoose";
import { AssistantAction, type AssistantActionDocument } from "../models/AssistantAction";
import {
  ASSISTANT_ACTION_HISTORY_FIELDS,
  ASSISTANT_ACTION_SAFE_FIELDS,
  type AssistantActionStatus,
  type AssistantConfirmationStatus,
} from "../utils/constants";

export type AssistantActionListFilters = {
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

function toPublic(doc: AssistantActionDocument | Record<string, unknown>) {
  if (typeof (doc as AssistantActionDocument).toJSON === "function") {
    const record = (doc as AssistantActionDocument).toJSON() as Record<string, unknown>;
    stringifyIds(record);
    return record;
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

export const assistantActionRepository = {
  create(data: Record<string, unknown>) {
    return AssistantAction.create(data);
  },

  findByActionId(actionId: string, userId?: string) {
    const query: FilterQuery<AssistantActionDocument> = { actionId };
    if (userId) query.userId = userId;
    return AssistantAction.findOne(query).select(ASSISTANT_ACTION_SAFE_FIELDS).lean();
  },

  findPendingConfirmation(userId: string, conversationId: string) {
    return AssistantAction.findOne({
      userId,
      conversationId,
      status: "REQUIRES_CONFIRMATION",
      confirmationStatus: "PENDING",
    })
      .select(ASSISTANT_ACTION_SAFE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
  },

  findByIdempotencyKey(userId: string, idempotencyKey: string) {
    if (!idempotencyKey) return Promise.resolve(null);
    return AssistantAction.findOne({ userId, idempotencyKey }).select(ASSISTANT_ACTION_SAFE_FIELDS).lean();
  },

  findLatestCompleted(userId: string, conversationId?: string) {
    if (!conversationId) return Promise.resolve(null);
    return AssistantAction.findOne({ userId, conversationId, status: "COMPLETED" })
      .select(ASSISTANT_ACTION_SAFE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
  },

  async list(filters: AssistantActionListFilters) {
    const query: FilterQuery<AssistantActionDocument> = { userId: filters.userId };
    if (filters.conversationId) query.conversationId = filters.conversationId;

    const [items, total] = await Promise.all([
      AssistantAction.find(query)
        .select(ASSISTANT_ACTION_HISTORY_FIELDS)
        .sort({ createdAt: -1 })
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      AssistantAction.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublic(item)), total };
  },

  claimConfirmation(actionId: string, userId: string) {
    return AssistantAction.findOneAndUpdate(
      {
        actionId,
        userId,
        status: "REQUIRES_CONFIRMATION",
        confirmationStatus: "PENDING",
      },
      { $set: { confirmationStatus: "CONFIRMED" } },
      { new: true },
    ).select(ASSISTANT_ACTION_SAFE_FIELDS);
  },

  updateByActionId(
    actionId: string,
    patch: {
      status?: AssistantActionStatus;
      confirmationStatus?: AssistantConfirmationStatus;
      result?: Record<string, unknown>;
      error?: string;
      pendingInput?: Record<string, unknown> | null;
      completedAt?: Date | null;
      processingTimeMs?: number;
    },
  ) {
    return AssistantAction.findOneAndUpdate({ actionId }, { $set: patch }, { new: true }).select(
      ASSISTANT_ACTION_SAFE_FIELDS,
    );
  },

  toPublic,
};
