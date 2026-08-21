import mongoose, { Schema } from "mongoose";
import { VENDOR_STATUSES, type VendorStatus } from "../utils/constants";

export type VendorDocument = mongoose.Document & {
  vendorId: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  taxIdentifier: string;
  status: VendorStatus;
  notes: string;
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const vendorSchema = new Schema<VendorDocument>(
  {
    vendorId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 160 },
    location: { type: String, default: "", trim: true, maxlength: 160 },
    taxIdentifier: { type: String, default: "", trim: true, uppercase: true, maxlength: 32 },
    status: { type: String, enum: VENDOR_STATUSES, required: true, default: "ACTIVE" },
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

vendorSchema.index({ vendorId: 1 }, { unique: true });
vendorSchema.index({ isDeleted: 1, name: 1 });
vendorSchema.index({ isDeleted: 1, createdAt: -1 });

export const Vendor = mongoose.model<VendorDocument>("Vendor", vendorSchema);
