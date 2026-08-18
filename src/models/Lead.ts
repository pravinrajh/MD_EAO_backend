import mongoose, { Schema } from "mongoose";
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  type LeadPriority,
  type LeadSource,
  type LeadStatus,
} from "../utils/constants";

/**
 * CRM estimatedValue is stored as integers in whole INR rupees (same as Project.budget).
 * Weighted pipeline is computed in aggregations; it is not persisted.
 */
export type LeadDocument = mongoose.Document & {
  leadId: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  source: LeadSource;
  industry: string;
  location: string;
  description: string;
  assignedTo: mongoose.Types.ObjectId | null;
  status: LeadStatus;
  priority: LeadPriority;
  estimatedValue: number;
  expectedCloseDate: Date | null;
  nextFollowUpAt: Date | null;
  convertedAt: Date | null;
  convertedCustomerId: mongoose.Types.ObjectId | null;
  convertedOpportunityId: mongoose.Types.ObjectId | null;
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

const leadSchema = new Schema<LeadDocument>(
  {
    leadId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    companyName: { type: String, default: "", trim: true, maxlength: 160 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },
    alternatePhone: { type: String, default: "", trim: true, maxlength: 20 },
    source: { type: String, enum: LEAD_SOURCES, required: true },
    industry: { type: String, default: "", trim: true, maxlength: 120 },
    location: { type: String, default: "", trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    assignedTo: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    status: { type: String, enum: LEAD_STATUSES, required: true, default: "NEW" },
    priority: { type: String, enum: LEAD_PRIORITIES, required: true, default: "MEDIUM" },
    estimatedValue: moneyInt,
    expectedCloseDate: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
    convertedCustomerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    convertedOpportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", default: null },
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

leadSchema.index({ leadId: 1 }, { unique: true });
leadSchema.index(
  { emailNormalized: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, emailNormalized: { $gt: "" } } },
);
leadSchema.index(
  { phoneNormalized: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, phoneNormalized: { $gt: "" } } },
);
leadSchema.index({ isDeleted: 1, assignedTo: 1, status: 1 });
leadSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
leadSchema.index({ isDeleted: 1, nextFollowUpAt: 1 });
leadSchema.index({ isDeleted: 1, createdAt: -1 });
leadSchema.index({ isDeleted: 1, source: 1, status: 1 });
leadSchema.index({ isDeleted: 1, companyNameNormalized: 1 });

export const Lead = mongoose.model<LeadDocument>("Lead", leadSchema);
