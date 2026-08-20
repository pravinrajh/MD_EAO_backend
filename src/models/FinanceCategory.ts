import mongoose, { Schema } from "mongoose";
import {
  FINANCE_CATEGORY_STATUSES,
  FINANCE_CATEGORY_TYPES,
  type FinanceCategoryStatus,
  type FinanceCategoryType,
} from "../utils/constants";

export type FinanceCategoryDocument = mongoose.Document & {
  categoryId: string;
  name: string;
  code: string;
  type: FinanceCategoryType;
  description: string;
  status: FinanceCategoryStatus;
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const financeCategorySchema = new Schema<FinanceCategoryDocument>(
  {
    categoryId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 16 },
    type: { type: String, enum: FINANCE_CATEGORY_TYPES, required: true },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    status: { type: String, enum: FINANCE_CATEGORY_STATUSES, required: true, default: "ACTIVE" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isDeleted: { type: Boolean, required: true, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
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

financeCategorySchema.index({ categoryId: 1 }, { unique: true });
financeCategorySchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, code: { $gt: "" } } },
);
financeCategorySchema.index({ isDeleted: 1, type: 1, status: 1 });
financeCategorySchema.index({ isDeleted: 1, createdAt: -1 });

export const FinanceCategory = mongoose.model<FinanceCategoryDocument>("FinanceCategory", financeCategorySchema);
