import mongoose, { Schema } from "mongoose";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "../utils/constants";

/**
 * estimatedValue is integer INR rupees. probability is 0–100.
 * weighted value = floor(estimatedValue * probability / 100) and is never stored.
 */
export type OpportunityDocument = mongoose.Document & {
  opportunityId: string;
  title: string;
  customerId: mongoose.Types.ObjectId;
  leadId: mongoose.Types.ObjectId | null;
  projectId: mongoose.Types.ObjectId | null;
  assignedTo: mongoose.Types.ObjectId | null;
  stage: OpportunityStage;
  probability: number;
  estimatedValue: number;
  expectedCloseDate: Date | null;
  description: string;
  nextFollowUpAt: Date | null;
  lostReason: string;
  wonAt: Date | null;
  lostAt: Date | null;
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

const opportunitySchema = new Schema<OpportunityDocument>(
  {
    opportunityId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    stage: { type: String, enum: OPPORTUNITY_STAGES, required: true, default: "NEW" },
    probability: { type: Number, required: true, default: 10, min: 0, max: 100 },
    estimatedValue: moneyInt,
    expectedCloseDate: { type: Date, default: null },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    nextFollowUpAt: { type: Date, default: null },
    lostReason: { type: String, default: "", trim: true, maxlength: 500 },
    wonAt: { type: Date, default: null },
    lostAt: { type: Date, default: null },
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

opportunitySchema.index({ opportunityId: 1 }, { unique: true });
opportunitySchema.index({ isDeleted: 1, customerId: 1, stage: 1 });
opportunitySchema.index({ isDeleted: 1, leadId: 1 });
opportunitySchema.index({ isDeleted: 1, projectId: 1 });
opportunitySchema.index({ isDeleted: 1, assignedTo: 1, stage: 1 });
opportunitySchema.index({ isDeleted: 1, stage: 1, expectedCloseDate: 1 });
opportunitySchema.index({ isDeleted: 1, expectedCloseDate: 1 });
opportunitySchema.index({ isDeleted: 1, createdAt: -1 });
opportunitySchema.index({ isDeleted: 1, nextFollowUpAt: 1 });

export const Opportunity = mongoose.model<OpportunityDocument>("Opportunity", opportunitySchema);
