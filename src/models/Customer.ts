import mongoose, { Schema } from "mongoose";
import { CUSTOMER_STATUSES, type CustomerStatus } from "../utils/constants";

/**
 * Customer is a converted or directly registered account. No invoicing fields.
 * estimatedValue lives on Opportunity, not here.
 */
export type CustomerDocument = mongoose.Document & {
  customerId: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  industry: string;
  location: string;
  address: string;
  taxIdentifier: string;
  assignedTo: mongoose.Types.ObjectId | null;
  sourceLeadId: mongoose.Types.ObjectId | null;
  status: CustomerStatus;
  notes: string;
  emailNormalized: string;
  phoneNormalized: string;
  companyNameNormalized: string;
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const customerSchema = new Schema<CustomerDocument>(
  {
    customerId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    companyName: { type: String, default: "", trim: true, maxlength: 160 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },
    alternatePhone: { type: String, default: "", trim: true, maxlength: 20 },
    industry: { type: String, default: "", trim: true, maxlength: 120 },
    location: { type: String, default: "", trim: true, maxlength: 160 },
    address: { type: String, default: "", trim: true, maxlength: 500 },
    taxIdentifier: { type: String, default: "", trim: true, uppercase: true, maxlength: 32 },
    assignedTo: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    sourceLeadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    status: { type: String, enum: CUSTOMER_STATUSES, required: true, default: "ACTIVE" },
    notes: { type: String, default: "", trim: true, maxlength: 4000 },
    emailNormalized: { type: String, default: "", trim: true, lowercase: true, maxlength: 160 },
    phoneNormalized: { type: String, default: "", trim: true, maxlength: 20 },
    companyNameNormalized: { type: String, default: "", trim: true, maxlength: 160 },
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
        delete value.emailNormalized;
        delete value.phoneNormalized;
        delete value.companyNameNormalized;
        return value;
      },
    },
  },
);

customerSchema.index({ customerId: 1 }, { unique: true });
customerSchema.index(
  { emailNormalized: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, emailNormalized: { $gt: "" } } },
);
customerSchema.index(
  { phoneNormalized: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, phoneNormalized: { $gt: "" } } },
);
customerSchema.index({ isDeleted: 1, assignedTo: 1, status: 1 });
customerSchema.index({ isDeleted: 1, companyNameNormalized: 1 });
customerSchema.index({ isDeleted: 1, createdAt: -1 });
customerSchema.index({ isDeleted: 1, sourceLeadId: 1 });
customerSchema.index({ isDeleted: 1, industry: 1, location: 1 });

export const Customer = mongoose.model<CustomerDocument>("Customer", customerSchema);
