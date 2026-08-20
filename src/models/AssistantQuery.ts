import mongoose, { Schema } from "mongoose";
import {
  ASSISTANT_INTENTS,
  ASSISTANT_QUERY_STATUSES,
  type AssistantIntent,
  type AssistantQueryStatus,
} from "../utils/constants";

export type AssistantQueryDocument = mongoose.Document & {
  queryId: string;
  userId: mongoose.Types.ObjectId;
  conversationId: string | null;
  message: string;
  intent: AssistantIntent;
  entities: Record<string, unknown>;
  answer: string;
  data: Record<string, unknown>;
  sources: Array<{ type: string; count?: number }>;
  confidence: number;
  status: AssistantQueryStatus;
  processingTimeMs: number;
  createdAt: Date;
  updatedAt: Date;
};

const assistantQuerySchema = new Schema<AssistantQueryDocument>(
  {
    queryId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: String, default: null, maxlength: 100, trim: true },
    message: { type: String, required: true, maxlength: 2000, trim: true },
    intent: { type: String, enum: ASSISTANT_INTENTS, required: true },
    entities: { type: Schema.Types.Mixed, required: true, default: {} },
    answer: { type: String, required: true, maxlength: 4000, default: "" },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
    sources: { type: Schema.Types.Mixed, required: true, default: [] },
    confidence: { type: Number, required: true, min: 0, max: 1, default: 0 },
    status: { type: String, enum: ASSISTANT_QUERY_STATUSES, required: true, default: "SUCCESS" },
    processingTimeMs: { type: Number, required: true, min: 0, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const value = ret as Record<string, unknown>;
        value.id = String(value._id);
        delete value._id;
        delete value.__v;
        return value;
      },
    },
  },
);

assistantQuerySchema.index({ queryId: 1 }, { unique: true });
assistantQuerySchema.index({ userId: 1, createdAt: -1 });
assistantQuerySchema.index({ userId: 1, conversationId: 1, createdAt: -1 });

export const AssistantQuery = mongoose.model<AssistantQueryDocument>("AssistantQuery", assistantQuerySchema);
