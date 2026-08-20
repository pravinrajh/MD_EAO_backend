import mongoose, { Schema } from "mongoose";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "../utils/constants";

export type TaskDocument = mongoose.Document & {
  taskId: string;
  title: string;
  description: string;
  assignedTo: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  reminderAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  completionNote: string;
  cancellationReason: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const taskSchema = new Schema<TaskDocument>(
  {
    taskId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    assignedTo: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    projectId: { type: Schema.Types.ObjectId, default: null },
    priority: { type: String, enum: TASK_PRIORITIES, required: true, default: "MEDIUM" },
    status: { type: String, enum: TASK_STATUSES, required: true, default: "PENDING" },
    dueDate: { type: Date, default: null },
    reminderAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    completionNote: { type: String, default: "", trim: true, maxlength: 1000 },
    cancellationReason: { type: String, default: "", trim: true, maxlength: 500 },
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

// Business-facing unique identifier (TASK-000001).
taskSchema.index({ taskId: 1 }, { unique: true });
// Default and creator lists exclude soft-deleted rows.
taskSchema.index({ isDeleted: 1, createdAt: -1 });
taskSchema.index({ isDeleted: 1, createdBy: 1, createdAt: -1 });
// My-tasks / assignee filters.
taskSchema.index({ isDeleted: 1, assignedTo: 1, status: 1 });
taskSchema.index({ isDeleted: 1, assignedTo: 1, dueDate: 1 });
// Overdue, today, and due-date range queries.
taskSchema.index({ isDeleted: 1, status: 1, dueDate: 1 });
// Dashboard recent activity.
taskSchema.index({ isDeleted: 1, updatedAt: -1 });
// Ready for project task lists without storing tasks on the Project document.
taskSchema.index({ isDeleted: 1, projectId: 1, status: 1 });
taskSchema.index({ isDeleted: 1, projectId: 1, dueDate: 1 });
taskSchema.index({ isDeleted: 1, projectId: 1, assignedTo: 1 });

export const Task = mongoose.model<TaskDocument>("Task", taskSchema);
