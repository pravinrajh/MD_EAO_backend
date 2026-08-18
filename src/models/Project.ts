import mongoose, { Schema } from "mongoose";
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type ProjectStatus,
  type ProjectType,
} from "../utils/constants";

/**
 * Monetary values are stored as integers in whole currency units (INR rupees).
 * Fractional paise are not used in Step 5. Remaining budget is integer subtraction.
 * Finance (later) can still treat these as the project-level totals.
 */
export type ProjectDocument = mongoose.Document & {
  projectId: string;
  name: string;
  code: string;
  description: string;
  location: string;
  projectType: ProjectType;
  managerId: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  status: ProjectStatus;
  progress: number;
  budget: number;
  actualExpense: number;
  startDate: Date | null;
  expectedEndDate: Date | null;
  completedAt: Date | null;
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

const projectSchema = new Schema<ProjectDocument>(
  {
    projectId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, default: "", trim: true, uppercase: true, maxlength: 32 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    location: { type: String, default: "", trim: true, maxlength: 160 },
    projectType: { type: String, enum: PROJECT_TYPES, required: true, default: "OTHER" },
    managerId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    members: { type: [{ type: Schema.Types.ObjectId, ref: "Employee" }], default: [] },
    status: { type: String, enum: PROJECT_STATUSES, required: true, default: "PLANNING" },
    progress: { type: Number, required: true, default: 0, min: 0, max: 100 },
    budget: moneyInt,
    actualExpense: moneyInt,
    startDate: { type: Date, default: null },
    expectedEndDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
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

projectSchema.index({ projectId: 1 }, { unique: true });
projectSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $gt: "" } } },
);
projectSchema.index({ isDeleted: 1, createdAt: -1 });
projectSchema.index({ isDeleted: 1, status: 1 });
projectSchema.index({ isDeleted: 1, managerId: 1, status: 1 });
projectSchema.index({ isDeleted: 1, projectType: 1, status: 1 });
projectSchema.index({ isDeleted: 1, location: 1 });
projectSchema.index({ isDeleted: 1, createdBy: 1 });

export const Project = mongoose.model<ProjectDocument>("Project", projectSchema);
