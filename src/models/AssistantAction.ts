import mongoose, { Schema } from "mongoose";
import {
  ASSISTANT_ACTION_INTENTS,
  ASSISTANT_ACTION_STATUSES,
  ASSISTANT_CONFIRMATION_STATUSES,
  type AssistantActionIntent,
  type AssistantActionStatus,
  type AssistantConfirmationStatus,
} from "../utils/constants";

export type AssistantActionDocument = mongoose.Document & {
  actionId: string;
  userId: mongoose.Types.ObjectId;
  conversationId: string | null;
  message: string;
  intent: AssistantActionIntent;
  entities: Record<string, unknown>;
  status: AssistantActionStatus;
  confirmationStatus: AssistantConfirmationStatus;
  pendingInput: Record<string, unknown> | null;
  result: Record<string, unknown>;
  error: string;
  idempotencyKey: string;
  processingTimeMs: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const assistantActionSchema = new Schema<AssistantActionDocument>(
  {
    actionId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: String, default: null, maxlength: 100, trim: true },
    message: { type: String, required: true, maxlength: 2000, trim: true },
    intent: { type: String, enum: ASSISTANT_ACTION_INTENTS, required: true },
    entities: { type: Schema.Types.Mixed, required: true, default: {} },
    status: { type: String, enum: ASSISTANT_ACTION_STATUSES, required: true, default: "PENDING" },
    confirmationStatus: {
      type: String,
      enum: ASSISTANT_CONFIRMATION_STATUSES,
      required: true,
      default: "NOT_REQUIRED",
    },
    pendingInput: { type: Schema.Types.Mixed, default: null },
    result: { type: Schema.Types.Mixed, required: true, default: {} },
    error: { type: String, default: "", maxlength: 1000 },
    idempotencyKey: { type: String, default: "", trim: true, maxlength: 128 },
    processingTimeMs: { type: Number, required: true, min: 0, default: 0 },
    completedAt: { type: Date, default: null },
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

assistantActionSchema.index({ actionId: 1 }, { unique: true });
assistantActionSchema.index({ userId: 1, createdAt: -1 });
assistantActionSchema.index({ userId: 1, conversationId: 1, createdAt: -1 });
assistantActionSchema.index({ status: 1, createdAt: -1 });
assistantActionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $gt: "" } } },
);

export const AssistantAction = mongoose.model<AssistantActionDocument>("AssistantAction", assistantActionSchema);
