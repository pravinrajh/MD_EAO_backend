import mongoose, { Schema } from "mongoose";
import { ROLES, USER_STATUSES, type Role, type UserStatus } from "../utils/constants";

export type UserDocument = mongoose.Document & {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: "EMPLOYEE" },
    status: { type: String, enum: USER_STATUSES, required: true, default: "ACTIVE" },
    isActive: { type: Boolean, required: true, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const value = ret as Record<string, unknown>;
        value.id = String(value._id);
        delete value._id;
        delete value.__v;
        delete value.passwordHash;
        return value;
      },
    },
  },
);

// Login, register, uniqueness.
userSchema.index({ email: 1 }, { unique: true });
// Role + status filters on GET /users.
userSchema.index({ role: 1, status: 1 });
// Status filter with createdAt sort.
userSchema.index({ status: 1, createdAt: -1 });
// Default list sort.
userSchema.index({ createdAt: -1 });

export const User = mongoose.model<UserDocument>("User", userSchema);
