import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Meeting } from "../src/models/Meeting";
import { Notification } from "../src/models/Notification";
import { Opportunity } from "../src/models/Opportunity";
import { Project } from "../src/models/Project";
import { Reminder } from "../src/models/Reminder";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import { FinanceTransaction } from "../src/models/FinanceTransaction";
import { logger } from "../src/config/logger";
import { OPEN_TASK_STATUSES } from "../src/utils/constants";
import { assertPerformanceMongoUri, performanceMongoUri } from "./lib/perfGuard";

type ExplainRow = {
  name: string;
  collection: string;
  executionTimeMillis: number | null;
  totalDocsExamined: number | null;
  totalKeysExamined: number | null;
  nReturned: number | null;
  winningPlan: unknown;
  collScan: boolean;
};

function hasCollScan(plan: unknown): boolean {
  return JSON.stringify(plan ?? {}).includes('"COLLSCAN"');
}

function stats(explain: Record<string, unknown>) {
  const executionStats = (explain.executionStats ?? explain) as Record<string, unknown>;
  const winningPlan =
    executionStats.executionStages ??
    (explain.queryPlanner as { winningPlan?: unknown } | undefined)?.winningPlan ??
    explain.queryPlanner;
  return {
    executionTimeMillis: typeof executionStats.executionTimeMillis === "number" ? executionStats.executionTimeMillis : null,
    totalDocsExamined: typeof executionStats.totalDocsExamined === "number" ? executionStats.totalDocsExamined : null,
    totalKeysExamined: typeof executionStats.totalKeysExamined === "number" ? executionStats.totalKeysExamined : null,
    nReturned: typeof executionStats.nReturned === "number" ? executionStats.nReturned : null,
    winningPlan,
  };
}

async function explainFind(
  name: string,
  collection: string,
  query: Record<string, unknown>,
): Promise<ExplainRow> {
  const models: Record<string, mongoose.Model<never>> = {
    tasks: Task as never,
    meetings: Meeting as never,
    projects: Project as never,
    opportunities: Opportunity as never,
    notifications: Notification as never,
    reminders: Reminder as never,
    users: User as never,
    financetransactions: FinanceTransaction as never,
  };
  const model = models[collection];
  const result = (await model.find(query).limit(20).explain("executionStats")) as Record<string, unknown>;
  const extracted = stats(result);
  return {
    name,
    collection,
    ...extracted,
    collScan: hasCollScan(extracted.winningPlan),
  };
}

async function run(): Promise<void> {
  const uri = performanceMongoUri();
  const dbName = assertPerformanceMongoUri(uri, "MongoDB explain");
  await mongoose.connect(uri);

  const now = new Date();
  const rows: ExplainRow[] = [
    await explainFind("pending_tasks", "tasks", { isDeleted: false, status: "PENDING" }),
    await explainFind("overdue_tasks", "tasks", {
      isDeleted: false,
      status: { $in: OPEN_TASK_STATUSES },
      dueDate: { $ne: null, $lt: now },
    }),
    await explainFind("today_meetings", "meetings", {
      isDeleted: false,
      startTime: {
        $gte: new Date(now.getTime() - 12 * 60 * 60 * 1000),
        $lt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
      },
    }),
    await explainFind("sales_pipeline", "opportunities", { isDeleted: false, stage: "NEW" }),
    await explainFind("unread_notifications", "notifications", { isDeleted: false, isRead: false }),
    await explainFind("due_reminders", "reminders", { status: "SCHEDULED", nextRunAt: { $lte: now } }),
    await explainFind("assistant_employee_lookup", "users", { email: "perf.user1@example.com" }),
    await explainFind("finance_summary", "financetransactions", {
      isDeleted: false,
      status: "COMPLETED",
      transactionDate: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
    }),
    await explainFind("assistant_project_lookup", "projects", { isDeleted: false, name: /Chennai/i }),
  ];

  const outDir = path.resolve(process.cwd(), "test-report");
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    executedAt: new Date().toISOString(),
    database: dbName,
    results: rows,
    collScanQueries: rows.filter((row) => row.collScan).map((row) => row.name),
  };
  fs.writeFileSync(path.join(outDir, "mongodb-explain-results.json"), JSON.stringify(payload, null, 2));
  logger.info({ dbName, collScan: payload.collScanQueries, count: rows.length }, "Explain results written");
  await mongoose.disconnect();
}

run().catch((error) => {
  logger.fatal({ err: error }, "Explain failed");
  process.exit(1);
});
