import mongoose, { Schema } from "mongoose";
import { MD_NOTE_RELATED_TYPES, type MdNoteRelatedType } from "../utils/constants";

export type MdNoteDocument = mongoose.Document & {
  noteId: string;
  body: string;
  relatedType: MdNoteRelatedType;
  relatedId: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const mdNoteSchema = new Schema<MdNoteDocument>(
  {
    noteId: { type: String, required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    relatedType: { type: String, enum: MD_NOTE_RELATED_TYPES, required: true, default: "NONE" },
    relatedId: { type: Schema.Types.ObjectId, default: null },
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

mdNoteSchema.index({ noteId: 1 }, { unique: true });
mdNoteSchema.index({ isDeleted: 1, createdBy: 1, createdAt: -1 });
mdNoteSchema.index({ isDeleted: 1, relatedType: 1, relatedId: 1 });

export const MdNote = mongoose.model<MdNoteDocument>("MdNote", mdNoteSchema);
