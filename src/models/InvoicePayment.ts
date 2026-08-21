import mongoose, { Schema } from "mongoose";
import { PAYMENT_METHODS, type PaymentMethod } from "../utils/constants";

export type InvoicePaymentDocument = mongoose.Document & {
  paymentId: string;
  invoiceId: mongoose.Types.ObjectId;
  amount: number;
  paidAt: Date;
  paymentMethod: PaymentMethod | "";
  notes: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

const invoicePaymentSchema = new Schema<InvoicePaymentDocument>(
  {
    paymentId: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator(value: number) {
          return Number.isInteger(value) && Number.isSafeInteger(value);
        },
        message: "Monetary values must be safe integers",
      },
    },
    paidAt: { type: Date, required: true },
    paymentMethod: { type: String, enum: [...PAYMENT_METHODS, ""], default: "" },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
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

invoicePaymentSchema.index({ paymentId: 1 }, { unique: true });
invoicePaymentSchema.index({ invoiceId: 1, createdAt: -1 });

export const InvoicePayment = mongoose.model<InvoicePaymentDocument>("InvoicePayment", invoicePaymentSchema);
