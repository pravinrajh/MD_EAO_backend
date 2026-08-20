import mongoose, { Schema } from "mongoose";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  DEFAULT_CURRENCY,
  type AccountStatus,
  type AccountType,
  type FinanceCurrency,
} from "../utils/constants";

/**
 * Monetary values are integers in whole INR rupees (same as Project.budget and CRM estimatedValue).
 * currentBalance changes only through completed FinanceTransactions — never via PATCH.
 */
export type AccountDocument = mongoose.Document & {
  accountId: string;
  name: string;
  code: string;
  type: AccountType;
  description: string;
  openingBalance: number;
  currentBalance: number;
  currency: FinanceCurrency;
  status: AccountStatus;
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
  default: 0,
  min: 0,
  validate: {
    validator(value: number) {
      return Number.isInteger(value) && Number.isSafeInteger(value);
    },
    message: "Monetary values must be safe integers",
  },
};

const accountSchema = new Schema<AccountDocument>(
  {
    accountId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 16 },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    openingBalance: moneyInt,
    currentBalance: moneyInt,
    currency: { type: String, enum: [DEFAULT_CURRENCY], required: true, default: DEFAULT_CURRENCY },
    status: { type: String, enum: ACCOUNT_STATUSES, required: true, default: "ACTIVE" },
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

accountSchema.index({ accountId: 1 }, { unique: true });
accountSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, code: { $gt: "" } } },
);
accountSchema.index({ isDeleted: 1, type: 1, status: 1 });
accountSchema.index({ isDeleted: 1, status: 1, name: 1 });
accountSchema.index({ isDeleted: 1, createdAt: -1 });

export const Account = mongoose.model<AccountDocument>("Account", accountSchema);
