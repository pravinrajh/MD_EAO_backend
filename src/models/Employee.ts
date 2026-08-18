import mongoose, { Schema } from "mongoose";
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  type EmployeeStatus,
  type EmploymentType,
} from "../utils/constants";

export type EmployeeDocument = mongoose.Document & {
  employeeId: string;
  userId: mongoose.Types.ObjectId;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  managerId: mongoose.Types.ObjectId | null;
  joiningDate: Date | null;
  employmentType: EmploymentType;
  location: string;
  status: EmployeeStatus;
  profileImage: string;
  createdAt: Date;
  updatedAt: Date;
};

const employeeSchema = new Schema<EmployeeDocument>(
  {
    employeeId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employeeCode: { type: String, required: true },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    displayName: { type: String, required: true, trim: true, maxlength: 160 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },
    department: { type: String, default: "", trim: true, maxlength: 120 },
    designation: { type: String, default: "", trim: true, maxlength: 120 },
    managerId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    joiningDate: { type: Date, default: null },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true, default: "FULL_TIME" },
    location: { type: String, default: "", trim: true, maxlength: 120 },
    status: { type: String, enum: EMPLOYEE_STATUSES, required: true, default: "ACTIVE" },
    profileImage: { type: String, default: "", trim: true, maxlength: 500 },
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

// One employee profile per auth user.
employeeSchema.index({ userId: 1 }, { unique: true });
// Concurrent-safe unique business identifier (EMP-000001).
employeeSchema.index({ employeeCode: 1 }, { unique: true });
employeeSchema.index({ employeeId: 1 }, { unique: true });
// List filters: department + status, employmentType + status.
employeeSchema.index({ department: 1, status: 1 });
employeeSchema.index({ designation: 1 });
employeeSchema.index({ managerId: 1 });
employeeSchema.index({ employmentType: 1, status: 1 });
// Default sort on list endpoints.
employeeSchema.index({ createdAt: -1 });

export const Employee = mongoose.model<EmployeeDocument>("Employee", employeeSchema);
