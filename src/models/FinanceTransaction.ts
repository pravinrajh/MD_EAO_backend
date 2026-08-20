import mongoose, { Schema } from "mongoose";
import {
  DEFAULT_CURRENCY,
  FINANCE_TRANSACTION_STATUSES,
  FINANCE_TRANSACTION_TYPES,
  PAYMENT_METHODS,
  type FinanceCurrency,
  type FinanceTransactionStatus,
  type FinanceTransactionType,
  type PaymentMethod,
} from "../utils/constants";

/**
 * amount is a positive integer in whole INR rupees. Direction comes from `type`, never a negative amount.
 * COMPLETED rows are immutable history. Transfers store source in accountId and destination in counterpartyAccountId.
 * externalReference / referenceType / referenceId are generic hooks for a future Invoice or Tally connector.
 */
export type FinanceTransactionDocument = mongoose.Document & {
  transactionId: string;
  type: FinanceTransactionType;
  accountId: mongoose.Types.ObjectId;
  counterpartyAccountId: mongoose.Types.ObjectId | null;
  categoryId: mongoose.Types.ObjectId | null;
  amount: number;
  currency: FinanceCurrency;
  description: string;
  referenceType: string;
  referenceId: string;
  projectId: mongoose.Types.ObjectId | null;
  customerId: mongoose.Types.ObjectId | null;
  opportunityId: mongoose.Types.ObjectId | null;
  transactionDate: Date;
  status: FinanceTransactionStatus;
  paymentMethod: PaymentMethod | "";
  externalReference: string;
  idempotencyKey: string;
  notes: string;
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

const financeTransactionSchema = new Schema<FinanceTransactionDocument>(
  {
    transactionId: { type: String, required: true },
    type: { type: String, enum: FINANCE_TRANSACTION_TYPES, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    counterpartyAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: "FinanceCategory", default: null },
    amount: moneyInt,
    currency: { type: String, enum: [DEFAULT_CURRENCY], required: true, default: DEFAULT_CURRENCY },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    referenceType: { type: String, default: "", trim: true, maxlength: 40 },
    referenceId: { type: String, default: "", trim: true, maxlength: 80 },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", default: null },
    transactionDate: { type: Date, required: true },
    status: { type: String, enum: FINANCE_TRANSACTION_STATUSES, required: true, default: "COMPLETED" },
    paymentMethod: { type: String, enum: [...PAYMENT_METHODS, ""], default: "" },
    externalReference: { type: String, default: "", trim: true, maxlength: 120 },
    idempotencyKey: { type: String, default: "", trim: true, maxlength: 128 },
    notes: { type: String, default: "", trim: true, maxlength: 4000 },
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

financeTransactionSchema.index({ transactionId: 1 }, { unique: true });
financeTransactionSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $gt: "" } } },
);
financeTransactionSchema.index({ isDeleted: 1, accountId: 1, transactionDate: -1 });
financeTransactionSchema.index({ isDeleted: 1, counterpartyAccountId: 1, transactionDate: -1 });
financeTransactionSchema.index({ isDeleted: 1, categoryId: 1, transactionDate: -1 });
financeTransactionSchema.index({ isDeleted: 1, projectId: 1, transactionDate: -1 });
financeTransactionSchema.index({ isDeleted: 1, customerId: 1, transactionDate: -1 });
financeTransactionSchema.index({ isDeleted: 1, opportunityId: 1, transactionDate: -1 });
financeTransactionSchema.index({ isDeleted: 1, type: 1, status: 1, transactionDate: -1 });
financeTransactionSchema.index({ isDeleted: 1, status: 1, transactionDate: -1 });
financeTransactionSchema.index({ isDeleted: 1, createdAt: -1 });

export const FinanceTransaction = mongoose.model<FinanceTransactionDocument>(
  "FinanceTransaction",
  financeTransactionSchema,
);
