import mongoose, { Schema } from "mongoose";
import { INVOICE_STATUSES, type InvoiceStatus } from "../utils/constants";

export type InvoiceDocument = mongoose.Document & {
  invoiceId: string;
  invoiceNumber: string;
  customerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId | null;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: Date | null;
  issueDate: Date;
  status: InvoiceStatus;
  description: string;
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
  min: 0,
  validate: {
    validator(value: number) {
      return Number.isInteger(value) && Number.isSafeInteger(value);
    },
    message: "Monetary values must be safe integers",
  },
};

const invoiceSchema = new Schema<InvoiceDocument>(
  {
    invoiceId: { type: String, required: true },
    invoiceNumber: { type: String, required: true, trim: true, maxlength: 40 },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    amount: { ...moneyInt, min: 1 },
    paidAmount: { ...moneyInt, default: 0 },
    balance: { ...moneyInt, default: 0 },
    dueDate: { type: Date, default: null },
    issueDate: { type: Date, required: true },
    status: { type: String, enum: INVOICE_STATUSES, required: true, default: "ISSUED" },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
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

invoiceSchema.index({ invoiceId: 1 }, { unique: true });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ isDeleted: 1, customerId: 1, createdAt: -1 });
invoiceSchema.index({ isDeleted: 1, projectId: 1, status: 1 });

export const Invoice = mongoose.model<InvoiceDocument>("Invoice", invoiceSchema);
