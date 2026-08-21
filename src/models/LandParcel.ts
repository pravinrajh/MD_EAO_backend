import mongoose, { Schema } from "mongoose";
import { LAND_PARCEL_STATUSES, type LandParcelStatus } from "../utils/constants";

export type LandParcelDocument = mongoose.Document & {
  parcelId: string;
  name: string;
  location: string;
  areaNote: string;
  ownerName: string;
  askingPrice: number;
  status: LandParcelStatus;
  projectId: mongoose.Types.ObjectId | null;
  notes: string;
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const landParcelSchema = new Schema<LandParcelDocument>(
  {
    parcelId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    location: { type: String, default: "", trim: true, maxlength: 160 },
    areaNote: { type: String, default: "", trim: true, maxlength: 400 },
    ownerName: { type: String, default: "", trim: true, maxlength: 160 },
    askingPrice: {
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
    },
    status: { type: String, enum: LAND_PARCEL_STATUSES, required: true, default: "AVAILABLE" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
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

landParcelSchema.index({ parcelId: 1 }, { unique: true });
landParcelSchema.index({ isDeleted: 1, location: 1, status: 1 });
landParcelSchema.index({ isDeleted: 1, createdAt: -1 });

export const LandParcel = mongoose.model<LandParcelDocument>("LandParcel", landParcelSchema);
