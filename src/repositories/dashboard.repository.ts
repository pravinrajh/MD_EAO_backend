import mongoose, { type FilterQuery } from "mongoose";
import { Account } from "../models/Account";
import { FinanceTransaction, type FinanceTransactionDocument } from "../models/FinanceTransaction";
import { Lead } from "../models/Lead";
import { Meeting } from "../models/Meeting";
import { Opportunity } from "../models/Opportunity";
import { Project, type ProjectDocument } from "../models/Project";
import { Task, type TaskDocument } from "../models/Task";
import {
  DASHBOARD_LIMITS,
  OPEN_TASK_STATUSES,
  type ProjectStatus,
  type TaskPriority,
} from "../utils/constants";

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function toObjectId(value: unknown) {
  if (typeof value === "string") return new mongoose.Types.ObjectId(value);
  return value;
}

function castTaskScope(scope: FilterQuery<TaskDocument> | undefined) {
  if (!scope) return {};
  if (!Array.isArray(scope.$or)) {
    const next: FilterQuery<TaskDocument> = { ...scope };
    if (typeof next.assignedTo === "string") next.assignedTo = toObjectId(next.assignedTo);
    if (typeof next.createdBy === "string") next.createdBy = toObjectId(next.createdBy);
    return next;
  }
  return {
    $or: scope.$or.map((clause) => {
      const next: FilterQuery<TaskDocument> = { ...clause };
      if (typeof next.assignedTo === "string") next.assignedTo = toObjectId(next.assignedTo);
      if (typeof next.createdBy === "string") next.createdBy = toObjectId(next.createdBy);
      if (Array.isArray((next.assignedTo as { $in?: unknown[] } | undefined)?.$in)) {
        next.assignedTo = { $in: (next.assignedTo as { $in: unknown[] }).$in.map((id) => toObjectId(id)) };
      }
      return next;
    }),
  };
}

function overdueMatch(now: Date): FilterQuery<TaskDocument> {
  return {
    status: { $in: OPEN_TASK_STATUSES },
    dueDate: { $ne: null, $lt: now },
  };
}

export const dashboardRepository = {
  async activeProjectCount(scope: FilterQuery<ProjectDocument> | undefined) {
    return Project.countDocuments({ isDeleted: false, status: "ACTIVE", ...(scope ?? {}) });
  },

  async projectHealthRows(input: {
    scope?: FilterQuery<ProjectDocument>;
    status?: ProjectStatus;
    now: Date;
  }) {
    const match: FilterQuery<ProjectDocument> = { isDeleted: false, ...(input.scope ?? {}) };
    if (input.status) match.status = input.status;

    return Project.aggregate<{
      _id: mongoose.Types.ObjectId;
      projectId: string;
      name: string;
      progress: number;
      status: ProjectStatus;
      budget: number;
      actualExpense: number;
      pendingTasks: number;
      overdueTasks: number;
    }>([
      { $match: match },
      {
        $lookup: {
          from: "tasks",
          let: { projectId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$projectId", "$$projectId"] }, { $eq: ["$isDeleted", false] }],
                },
              },
            },
            {
              $facet: {
                pending: [{ $match: { status: { $in: OPEN_TASK_STATUSES } } }, { $count: "n" }],
                overdue: [
                  {
                    $match: {
                      status: { $in: OPEN_TASK_STATUSES },
                      dueDate: { $ne: null, $lt: input.now },
                    },
                  },
                  { $count: "n" },
                ],
              },
            },
          ],
          as: "taskStats",
        },
      },
      {
        $set: {
          pendingTasks: { $ifNull: [{ $first: { $first: "$taskStats.pending.n" } }, 0] },
          overdueTasks: { $ifNull: [{ $first: { $first: "$taskStats.overdue.n" } }, 0] },
        },
      },
      {
        $project: {
          projectId: 1,
          name: 1,
          progress: 1,
          status: 1,
          budget: 1,
          actualExpense: 1,
          pendingTasks: 1,
          overdueTasks: 1,
        },
      },
    ]);
  },

  async topOverdueTasks(scope: FilterQuery<TaskDocument> | undefined, now: Date, limit = DASHBOARD_LIMITS.overdueTasks) {
    return Task.aggregate<{
      _id: mongoose.Types.ObjectId;
      taskId: string;
      title: string;
      priority: TaskPriority;
      assignedTo: mongoose.Types.ObjectId;
      projectId: mongoose.Types.ObjectId | null;
      dueDate: Date;
    }>([
      { $match: { isDeleted: false, ...castTaskScope(scope), ...overdueMatch(now) } },
      {
        $addFields: {
          priorityWeight: {
            $switch: {
              branches: [
                { case: { $eq: ["$priority", "CRITICAL"] }, then: PRIORITY_WEIGHT.CRITICAL },
                { case: { $eq: ["$priority", "HIGH"] }, then: PRIORITY_WEIGHT.HIGH },
                { case: { $eq: ["$priority", "MEDIUM"] }, then: PRIORITY_WEIGHT.MEDIUM },
              ],
              default: PRIORITY_WEIGHT.LOW,
            },
          },
        },
      },
      { $sort: { priorityWeight: -1, dueDate: 1 } },
      { $limit: limit },
      { $project: { taskId: 1, title: 1, priority: 1, assignedTo: 1, projectId: 1, dueDate: 1 } },
    ]);
  },

  async cashBankBalance() {
    const [row] = await Account.aggregate<{ total: number }>([
      { $match: { isDeleted: false, status: "ACTIVE", type: { $in: ["CASH", "BANK"] } } },
      { $group: { _id: null, total: { $sum: "$currentBalance" } } },
    ]);
    return row?.total ?? 0;
  },

  async weekFlows(match: FilterQuery<FinanceTransactionDocument>) {
    const [row] = await FinanceTransaction.aggregate<{
      expectedIncome: number;
      plannedExpenses: number;
    }>([
      { $match: { isDeleted: false, status: { $in: ["COMPLETED", "PENDING"] }, ...match } },
      {
        $group: {
          _id: null,
          expectedIncome: { $sum: { $cond: [{ $eq: ["$type", "INCOME"] }, "$amount", 0] } },
          plannedExpenses: { $sum: { $cond: [{ $eq: ["$type", "EXPENSE"] }, "$amount", 0] } },
        },
      },
    ]);
    return {
      expectedIncome: row?.expectedIncome ?? 0,
      plannedExpenses: row?.plannedExpenses ?? 0,
    };
  },

  async weekExpenseItems(match: FilterQuery<FinanceTransactionDocument>) {
    return FinanceTransaction.aggregate<{ category: string; amount: number }>([
      { $match: { isDeleted: false, type: "EXPENSE", status: { $in: ["COMPLETED", "PENDING"] }, ...match } },
      { $group: { _id: "$categoryId", amount: { $sum: "$amount" } } },
      {
        $lookup: {
          from: "financecategories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          category: { $ifNull: ["$category.name", "Uncategorized"] },
          amount: 1,
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 10 },
    ]);
  },

  async recentActivity(input: {
    taskScope?: FilterQuery<TaskDocument>;
    projectScope?: FilterQuery<ProjectDocument>;
    meetingScope?: FilterQuery<unknown>;
    crmScope?: FilterQuery<unknown>;
    includeFinance: boolean;
    limit: number;
  }) {
    const take = Math.min(input.limit, DASHBOARD_LIMITS.activity);
    const perSource = Math.min(8, take);

    const [tasks, projects, meetings, leads, opportunities, finance] = await Promise.all([
      Task.find({ isDeleted: false, ...castTaskScope(input.taskScope) })
        .select("taskId title status assignedTo updatedAt createdAt completedAt")
        .sort({ updatedAt: -1 })
        .limit(perSource)
        .lean(),
      Project.find({ isDeleted: false, ...(input.projectScope ?? {}) })
        .select("projectId name status updatedAt createdAt")
        .sort({ updatedAt: -1 })
        .limit(perSource)
        .lean(),
      Meeting.find({ isDeleted: false, ...(input.meetingScope ?? {}) })
        .select("meetingId title status createdAt startTime")
        .sort({ createdAt: -1 })
        .limit(perSource)
        .lean(),
      Lead.find({ isDeleted: false, ...(input.crmScope ?? {}) })
        .select("leadId name status createdAt")
        .sort({ createdAt: -1 })
        .limit(perSource)
        .lean(),
      Opportunity.find({ isDeleted: false, stage: "WON", ...(input.crmScope ?? {}) })
        .select("opportunityId title stage wonAt createdAt")
        .sort({ wonAt: -1, createdAt: -1 })
        .limit(perSource)
        .lean(),
      input.includeFinance
        ? FinanceTransaction.find({ isDeleted: false })
            .select("transactionId type amount createdAt")
            .sort({ createdAt: -1 })
            .limit(perSource)
            .lean()
        : Promise.resolve([]),
    ]);

    const items = [
      ...tasks.map((row) => ({
        type: "TASK" as const,
        title:
          row.status === "COMPLETED"
            ? `${row.title} completed`
            : `${row.title} ${row.status === "PENDING" ? "created" : "updated"}`,
        timestamp: row.updatedAt ?? row.createdAt,
        sourceId: String(row._id),
      })),
      ...projects.map((row) => ({
        type: "PROJECT" as const,
        title: `${row.name} updated`,
        timestamp: row.updatedAt ?? row.createdAt,
        sourceId: String(row._id),
      })),
      ...meetings.map((row) => ({
        type: "MEETING" as const,
        title: `${row.title} created`,
        timestamp: row.createdAt,
        sourceId: String(row._id),
      })),
      ...leads.map((row) => ({
        type: "LEAD" as const,
        title: `Lead created: ${row.name}`,
        timestamp: row.createdAt,
        sourceId: String(row._id),
      })),
      ...opportunities.map((row) => ({
        type: "OPPORTUNITY" as const,
        title: `Opportunity won: ${row.title}`,
        timestamp: row.wonAt ?? row.createdAt,
        sourceId: String(row._id),
      })),
      ...finance.map((row) => ({
        type: "FINANCE" as const,
        title: `${row.type} recorded (${row.amount})`,
        timestamp: row.createdAt,
        sourceId: String(row._id),
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, take);

    return items;
  },

  toObjectId,
};
