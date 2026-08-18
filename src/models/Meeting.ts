import mongoose, { Schema } from "mongoose";
import {
  MEETING_STATUSES,
  MEETING_TYPES,
  type MeetingStatus,
  type MeetingType,
} from "../utils/constants";

export type MeetingDocument = mongoose.Document & {
  meetingId: string;
  title: string;
  description: string;
  meetingType: MeetingType;
  organizerId: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
  projectId: mongoose.Types.ObjectId | null;
  location: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  status: MeetingStatus;
  notes: string;
  cancellationReason: string;
  cancelledAt: Date | null;
  completedAt: Date | null;
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const meetingSchema = new Schema<MeetingDocument>(
  {
    meetingId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    meetingType: { type: String, enum: MEETING_TYPES, required: true, default: "INTERNAL" },
    organizerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    participants: { type: [{ type: Schema.Types.ObjectId, ref: "Employee" }], default: [] },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    location: { type: String, default: "", trim: true, maxlength: 200 },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    timezone: { type: String, required: true, default: "Asia/Kolkata" },
    status: { type: String, enum: MEETING_STATUSES, required: true, default: "SCHEDULED" },
    notes: { type: String, default: "", trim: true, maxlength: 4000 },
    cancellationReason: { type: String, default: "", trim: true, maxlength: 500 },
    cancelledAt: { type: Date, default: null },
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

// Business-facing MTG-000001 lookup and uniqueness.
meetingSchema.index({ meetingId: 1 }, { unique: true });
// Today's meetings, upcoming windows, and default list sort.
meetingSchema.index({ isDeleted: 1, startTime: 1 });
// Organizer calendar and "my meetings" by host.
meetingSchema.index({ isDeleted: 1, organizerId: 1, startTime: 1 });
// Project meeting lists: GET /projects/:id/meetings.
meetingSchema.index({ isDeleted: 1, projectId: 1, startTime: 1 });
// Status filters combined with date sort.
meetingSchema.index({ isDeleted: 1, status: 1, startTime: 1 });
// Fallback recency sort.
meetingSchema.index({ isDeleted: 1, createdAt: -1 });
// Conflict detection: participant + overlap window + non-cancelled.
meetingSchema.index({ isDeleted: 1, participants: 1, startTime: 1, endTime: 1, status: 1 });

export const Meeting = mongoose.model<MeetingDocument>("Meeting", meetingSchema);
