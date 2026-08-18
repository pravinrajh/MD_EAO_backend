import mongoose, { Schema } from "mongoose";
import {
  SALES_ACTIVITY_STATUSES,
  SALES_ACTIVITY_TYPES,
  type SalesActivityStatus,
  type SalesActivityType,
} from "../utils/constants";

export type SalesActivityDocument = mongoose.Document & {
  activityId: string;
  type: SalesActivityType;
  title: string;
  description: string;
  leadId: mongoose.Types.ObjectId | null;
  customerId: mongoose.Types.ObjectId | null;
  opportunityId: mongoose.Types.ObjectId | null;
  employeeId: mongoose.Types.ObjectId;
  scheduledAt: Date | null;
  completedAt: Date | null;
  status: SalesActivityStatus;
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const salesActivitySchema = new Schema<SalesActivityDocument>(
  {
    activityId: { type: String, required: true },
    type: { type: String, enum: SALES_ACTIVITY_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", default: null },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    scheduledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    status: { type: String, enum: SALES_ACTIVITY_STATUSES, required: true, default: "PENDING" },
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

salesActivitySchema.index({ activityId: 1 }, { unique: true });
salesActivitySchema.index({ isDeleted: 1, leadId: 1, scheduledAt: 1 });
salesActivitySchema.index({ isDeleted: 1, customerId: 1, scheduledAt: 1 });
salesActivitySchema.index({ isDeleted: 1, opportunityId: 1, scheduledAt: 1 });
salesActivitySchema.index({ isDeleted: 1, employeeId: 1, scheduledAt: 1 });
salesActivitySchema.index({ isDeleted: 1, status: 1, scheduledAt: 1 });
salesActivitySchema.index({ isDeleted: 1, createdAt: -1 });

export const SalesActivity = mongoose.model<SalesActivityDocument>("SalesActivity", salesActivitySchema);
