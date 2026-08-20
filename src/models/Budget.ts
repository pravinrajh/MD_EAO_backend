import mongoose, { Schema } from "mongoose";
import {
  BUDGET_STATUSES,
  DEFAULT_CURRENCY,
  type BudgetStatus,
  type FinanceCurrency,
} from "../utils/constants";

/** amount is integer whole INR rupees. actual/remaining are derived from COMPLETED expenses. */
export type BudgetDocument = mongoose.Document & {
  budgetId: string;
  name: string;
  projectId: mongoose.Types.ObjectId | null;
  categoryId: mongoose.Types.ObjectId | null;
  amount: number;
  currency: FinanceCurrency;
  periodStart: Date;
  periodEnd: Date;
  status: BudgetStatus;
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const moneyInt = {
  type: Number,
  required: true,
  min: 1,
  validate: {
    validator(value: number) {
      return Number.isInteger(value) && Number.isSafeInteger(value);
    },
    message: "Monetary values must be safe integers",
  },
};

const budgetSchema = new Schema<BudgetDocument>(
  {
    budgetId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: "FinanceCategory", default: null },
    amount: moneyInt,
    currency: { type: String, enum: [DEFAULT_CURRENCY], required: true, default: DEFAULT_CURRENCY },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: BUDGET_STATUSES, required: true, default: "ACTIVE" },
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

budgetSchema.index({ budgetId: 1 }, { unique: true });
budgetSchema.index({ isDeleted: 1, projectId: 1, periodStart: 1 });
budgetSchema.index({ isDeleted: 1, categoryId: 1, periodStart: 1 });
budgetSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });

export const Budget = mongoose.model<BudgetDocument>("Budget", budgetSchema);
