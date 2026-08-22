import { env } from "../../config/env";
import { logger } from "../../config/logger";
import {
  ASSISTANT_QUERY_TIMEOUT_MS,
  type AssistantIntent,
  type AssistantQueryStatus,
} from "../../utils/constants";
import { AppError, ForbiddenError, TimeoutError } from "../../utils/errors";
import { isDuplicateKey } from "../../utils/mongo";
import { buildPaginationMeta, parsePagination } from "../../utils/pagination";
import { nextQueryId } from "../../utils/sequence";
import { assistantQueryRepository } from "../../repositories/assistantQuery.repository";
import { aiOrchestrator } from "./ai.orchestrator";
import { entityResolver } from "./entityResolver.service";
import { getLlmProvider } from "./gemini.provider";
import { intentExecutorService } from "./intentExecutor.service";
import {
  detectIntent,
  extractEntities,
  normalizeQuery,
  resolveEntities,
} from "./intentRouter.service";
import { aiPermissionAdapter } from "./permission.adapter";
import { queryPlanExecutor } from "./queryPlanExecutor.service";
import { dynamicQueryExecutor } from "./dynamicQueryExecutor.service";
import { classifyQueryEvaluation } from "./evaluation";
import { looksLikeMissingDomain } from "./dynamicQueryPlanner.service";
import { formatAssistantResponse } from "./responseFormatter.service";
import { queryToolName, toolRegistry } from "./toolRegistry";
import type {
  AssistantActor,
  AssistantQueryResult,
  AssistantSource,
  DetectedIntent,
  ExtractedEntities,
  ResolvedEntities,
} from "./types";

const ID_RETRIES = 3;
const STORAGE_DATA_MAX = 12_000;
const PROJECT_INTENTS = new Set<AssistantIntent>([
  "PROJECT_STATUS",
  "PROJECT_HEALTH",
  "PROJECT_TASKS",
  "PROJECT_FINANCE",
]);
const UNSUPPORTED_ANSWER =
  "I can't answer that yet. I currently support company tasks, projects, meetings, sales, finance, and executive reports.";
const SMALLTALK_ANSWER =
  "Hi! I'm your office assistant. Ask me about projects, tasks, people, meetings, or sales.";
const SMALLTALK_OFFLINE_ANSWER =
  "Hi! I'm your office assistant. Gemini is not connected right now, so this greeting is local. Ask me about projects, tasks, people, meetings, or sales — those answers still come from live office data.";

function scrubSecrets(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 2000);
}

function compactStoredData(data: Record<string, unknown>): Record<string, unknown> {
  const serialized = JSON.stringify(data);
  if (serialized.length <= STORAGE_DATA_MAX) return data;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      copy[key] = value.slice(0, 10);
      copy[`${key}Count`] = value.length;
    } else if (value && typeof value === "object") {
      copy[key] = { summary: true };
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError("That query took too long. Please try a more specific question."));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function permissionAnswer(intent: AssistantIntent, error: ForbiddenError): string {
  if (
    intent === "FINANCE_SUMMARY" ||
    intent === "MONTHLY_FINANCE" ||
    intent === "WEEKLY_FINANCIAL_REQUIREMENT" ||
    intent === "BUDGET_SUMMARY" ||
    intent === "PROJECT_FINANCE"
  ) {
    return "You don't have permission to access company-wide financial information.";
  }
  if (intent === "COMPANY_SUMMARY") {
    return "You don't have permission to access company-wide executive information.";
  }
  if (error.message.toLowerCase().includes("employee")) {
    return "You don't have permission to view that employee's data.";
  }
  return "You don't have permission to view that information.";
}

function notFoundAnswer(field: string, name: string): string {
  if (field === "project") return `I couldn't find a project matching ${name}.`;
  if (field === "employee") return `I couldn't find an employee matching ${name}.`;
  if (field === "customer") return `I couldn't find a customer matching ${name}.`;
  if (field === "lead") return `I couldn't find a lead matching ${name}.`;
  if (field === "opportunity") return `I couldn't find an opportunity matching ${name}.`;
  return `I couldn't find a match for ${name}.`;
}

function confidenceScore(input: {
  detected: DetectedIntent;
  resolved?: ResolvedEntities;
  status: AssistantQueryStatus;
  clarification?: boolean;
  empty?: boolean;
}): number {
  if (input.detected.intent === "UNSUPPORTED" || input.status === "UNSUPPORTED") return 0;
  if (input.clarification) return 0.5;
  if (input.resolved?.notFound) return 0.7;
  if (input.status === "FAILED") return 0;
  let score = input.detected.confidence;
  if (input.resolved?.projectId || input.resolved?.employeeId) score = Math.min(0.98, score + 0.02);
  if (input.empty) score = Math.min(score, 0.9);
  return Math.round(score * 100) / 100;
}

async function allocateQueryId(): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
    try {
      return await nextQueryId();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to allocate query ID");
}

async function saveQuery(record: {
  queryId: string;
  userId: string;
  conversationId?: string;
  message: string;
  intent: AssistantIntent;
  entities: Record<string, unknown>;
  answer: string;
  data: Record<string, unknown>;
  sources: AssistantSource[];
  confidence: number;
  status: AssistantQueryStatus;
  processingTimeMs: number;
}): Promise<void> {
  for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
    try {
      await assistantQueryRepository.create({
        ...record,
        conversationId: record.conversationId ?? null,
        message: scrubSecrets(record.message),
        data: compactStoredData(record.data),
        entities: compactStoredData(record.entities),
      });
      return;
    } catch (error) {
      if (isDuplicateKey(error, "queryId") && attempt < ID_RETRIES - 1) {
        record.queryId = await nextQueryId();
        continue;
      }
      logger.warn({ err: error, queryId: record.queryId }, "Failed to store assistant query");
      return;
    }
  }
}

function publicEntities(resolved: ResolvedEntities): Record<string, unknown> {
  const entities: Record<string, unknown> = {};
  if (resolved.projectName) entities.projectName = resolved.projectName;
  if (resolved.projectId) entities.projectId = resolved.projectId;
  if (resolved.employeeName) entities.employeeName = resolved.employeeName;
  if (resolved.employeeId) entities.employeeId = resolved.employeeId;
  if (resolved.customerName) entities.customerName = resolved.customerName;
  if (resolved.dateRange) entities.dateRange = resolved.dateRange;
  if (resolved.priority) entities.priority = resolved.priority;
  if (resolved.status) entities.status = resolved.status;
  if (typeof resolved.minPending === "number") entities.minPending = resolved.minPending;
  return entities;
}

function conversationEntities(resolved: ResolvedEntities, data: Record<string, unknown>): Record<string, unknown> {
  const entities = publicEntities(resolved);
  const employees = Array.isArray(data.employees) ? data.employees[0] : null;
  if (employees && typeof employees === "object") {
    const row = employees as Record<string, unknown>;
    if (!entities.employeeName && typeof row.employee === "string") entities.employeeName = row.employee;
    if (!entities.employeeName && typeof row.employeeName === "string") entities.employeeName = row.employeeName;
    if (typeof row.employeeId === "string") entities.employeeId = row.employeeId;
  }
  const projects = Array.isArray(data.projects) ? data.projects[0] : null;
  if (projects && typeof projects === "object") {
    const row = projects as Record<string, unknown>;
    if (!entities.projectName && typeof row.projectName === "string") entities.projectName = row.projectName;
    if (!entities.projectName && typeof row.name === "string") entities.projectName = row.name;
    if (!entities.projectId && typeof row.id === "string") entities.projectId = row.id;
  }
  if (!entities.projectName && typeof data.name === "string") entities.projectName = data.name;
  if (!entities.projectId && typeof data.projectId === "string") entities.projectId = data.projectId;
  return entities;
}

export const assistantService = {
  normalizeQuery,
  detectIntent,
  extractEntities,
  resolveEntities,

  async formatResponse(intent: AssistantIntent, data: Record<string, unknown>, sources: AssistantSource[]) {
    return formatAssistantResponse(intent, data, sources);
  },

  async saveQuery(record: Parameters<typeof saveQuery>[0]) {
    return saveQuery(record);
  },

  async executeQuery(intent: AssistantIntent, actor: AssistantActor, entities: ResolvedEntities) {
    return intentExecutorService.execute(intent, actor, entities);
  },

  async getHistory(actor: AssistantActor, query: Record<string, unknown>) {
    const { page, limit, skip } = parsePagination(query);
    const conversationId = typeof query.conversationId === "string" ? query.conversationId : undefined;
    const result = await assistantQueryRepository.list({
      userId: actor.id,
      conversationId,
      skip,
      limit,
    });
    return {
      items: result.items,
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async processQuery(input: {
    message: string;
    conversationId?: string;
    actor: AssistantActor;
  }): Promise<AssistantQueryResult> {
    const started = Date.now();
    const queryId = await allocateQueryId();
    const { original, normalized } = normalizeQuery(input.message);
    const { detected, extracted, plan, bql, llm } = await aiOrchestrator.planQuery({
      original,
      normalized,
      conversationId: input.conversationId,
      actor: input.actor,
    });

    const geminiTrace = (extra?: Record<string, unknown>) => ({
      connected: getLlmProvider().isEnabled(),
      used: Boolean(llm) || Boolean(extra?.reply),
      model: env.GEMINI_MODEL,
      understood: llm ? `${llm.kind}:${llm.intent}` : extra?.understood,
      english: llm?.english,
      entities: llm?.entities ?? extracted,
      lookupPlan: bql
        ? {
            operation: bql.operation,
            sources: bql.sources,
            filters: bql.filters,
            dateRange: bql.dateRange,
            entityHints: bql.entityHints,
          }
        : plan
          ? { intent: plan.intent, tools: plan.tools, filters: plan.filters }
          : null,
      ...extra,
    });

    const persist = async (
      payload: Omit<AssistantQueryResult, "queryId"> & { status: AssistantQueryStatus; entities?: Record<string, unknown> },
    ): Promise<AssistantQueryResult> => {
      const processingTimeMs = Date.now() - started;
      const data = {
        ...payload.data,
        gemini: geminiTrace(payload.data?.gemini as Record<string, unknown> | undefined),
        evaluation: classifyQueryEvaluation({
          originalQuestion: original,
          normalizedQuestion: normalized,
          userRole: input.actor.role,
          intent: payload.intent,
          serviceCalled: queryToolName(payload.intent),
          dataStatus: typeof payload.data.status === "string" ? payload.data.status : undefined,
          queryStatus: payload.status,
          missingDomain: typeof payload.data.missingDomain === "string" ? payload.data.missingDomain : undefined,
          notFoundField: typeof payload.data.field === "string" ? payload.data.field : undefined,
          clarification: payload.data.status === "CLARIFICATION_REQUIRED",
          timeout: payload.data.status === "TIMEOUT",
          forbidden: payload.data.status === "FORBIDDEN",
        }),
      };
      await saveQuery({
        queryId,
        userId: input.actor.id,
        conversationId: input.conversationId,
        message: original,
        intent: payload.intent,
        entities: payload.entities ?? extracted,
        answer: payload.answer,
        data,
        sources: payload.sources,
        confidence: payload.confidence,
        status: payload.status,
        processingTimeMs,
      });
      logger.info(
        {
          queryId,
          userId: input.actor.id,
          intent: payload.intent,
          tool: queryToolName(payload.intent),
          status: payload.status,
          processingTimeMs,
        },
        "Assistant query processed",
      );
      return {
        queryId,
        intent: payload.intent,
        answer: payload.answer,
        data,
        sources: payload.sources,
        confidence: payload.confidence,
        toolsUsed: Array.isArray(payload.data.toolsUsed) ? (payload.data.toolsUsed as string[]) : undefined,
      };
    };

    if (detected.intent === "SMALLTALK") {
      const provider = getLlmProvider();
      const geminiConnected = provider.isEnabled();
      let answer = geminiConnected ? SMALLTALK_ANSWER : SMALLTALK_OFFLINE_ANSWER;
      let geminiReplied = false;
      if (geminiConnected && provider.chat) {
        const spoken = await provider.chat({ message: original, kind: "smalltalk" });
        if (spoken) {
          answer = spoken;
          geminiReplied = true;
        }
      }
      return persist({
        intent: "SMALLTALK",
        answer,
        data: {
          geminiConnected,
          geminiReplied,
          gemini: { understood: "query:SMALLTALK", reply: answer },
        },
        sources: [],
        confidence: 0.99,
        status: "SUCCESS",
      });
    }

    if (detected.intent === "UNSUPPORTED") {
      const missing = looksLikeMissingDomain(normalized);
      return persist({
        intent: "UNSUPPORTED",
        answer: missing
          ? `I don't have ${missing} data connected to the system.`
          : UNSUPPORTED_ANSWER,
        data: missing ? { missingDomain: missing } : {},
        sources: [],
        confidence: 0,
        status: "UNSUPPORTED",
      });
    }

    try {
      const executed = await withTimeout(
        (async () => {
          const requireEmployee = detected.intent === "EMPLOYEE_DAILY_STATUS";
          // Office list intents must not fail when Gemini invents a projectName (e.g. "MD note OMR").
          if (
            detected.intent === "MD_NOTES" ||
            detected.intent === "VENDOR_LIST" ||
            detected.intent === "LAND_PARCEL_LIST" ||
            detected.intent === "INVOICE_SUMMARY"
          ) {
            delete extracted.projectName;
            delete extracted.projectId;
          }
          const requireProject = bql || plan
            ? Boolean(extracted.projectName)
            : PROJECT_INTENTS.has(detected.intent) &&
              (Boolean(extracted.projectName) || detected.intent !== "PROJECT_HEALTH");
          const resolved = await entityResolver.resolveQuery(extracted, input.actor, { requireProject, requireEmployee });

          if (resolved.clarification) {
            return {
              kind: "clarification" as const,
              resolved,
              formatted: {
                answer: resolved.clarification.question,
                data: {
                  status: "CLARIFICATION_REQUIRED",
                  field: resolved.clarification.field,
                  options: resolved.clarification.options,
                },
                sources: [],
              },
            };
          }

          if (resolved.notFound) {
            return {
              kind: "not_found" as const,
              resolved,
              formatted: {
                answer: notFoundAnswer(resolved.notFound.field, resolved.notFound.name),
                data: { status: "NOT_FOUND", field: resolved.notFound.field, name: resolved.notFound.name },
                sources: [],
              },
            };
          }

          const payload = await (async () => {
            aiPermissionAdapter.assertQuery(detected.intent, input.actor);
            if (bql) {
              return dynamicQueryExecutor.execute(bql, input.actor, resolved);
            }
            if (plan) {
              if (extracted.minPending && !plan.filters.minPending) plan.filters.minPending = extracted.minPending;
              return queryPlanExecutor.execute(plan, input.actor, resolved);
            }
            return toolRegistry.executeQuery(detected.intent, input.actor, resolved);
          })();
          return {
            kind: "ok" as const,
            resolved,
            payload,
            formatted: await aiOrchestrator.finalizeQueryAnswer(
              payload.intent,
              payload.data,
              payload.sources,
              original,
            ),
          };
        })(),
        ASSISTANT_QUERY_TIMEOUT_MS,
      );

      if (executed.kind === "clarification") {
        return persist({
          intent: detected.intent,
          answer: executed.formatted.answer,
          data: executed.formatted.data,
          sources: executed.formatted.sources,
          confidence: confidenceScore({ detected, resolved: executed.resolved, status: "SUCCESS", clarification: true }),
          status: "SUCCESS",
          entities: publicEntities(executed.resolved),
        });
      }

      if (executed.kind === "not_found") {
        return persist({
          intent: detected.intent,
          answer: executed.formatted.answer,
          data: executed.formatted.data,
          sources: executed.formatted.sources,
          confidence: confidenceScore({ detected, resolved: executed.resolved, status: "SUCCESS" }),
          status: "SUCCESS",
          entities: publicEntities(executed.resolved),
        });
      }

      return persist({
        intent: executed.payload.intent,
        answer: executed.formatted.answer,
        data: executed.formatted.data,
        sources: executed.formatted.sources,
        confidence: confidenceScore({
          detected,
          resolved: executed.resolved,
          status: "SUCCESS",
          empty: asEmpty(executed.payload.data),
        }),
        status: "SUCCESS",
        entities: conversationEntities(executed.resolved, executed.payload.data),
      });
    } catch (error) {
      const processingTimeMs = Date.now() - started;
      if (error instanceof ForbiddenError) {
        const answer = permissionAnswer(detected.intent, error);
        return persist({
          intent: detected.intent,
          answer,
          data: { status: "FORBIDDEN" },
          sources: [],
          confidence: 0.95,
          status: "SUCCESS",
        });
      }

      if (error instanceof TimeoutError) {
        await saveQuery({
          queryId,
          userId: input.actor.id,
          conversationId: input.conversationId,
          message: original,
          intent: detected.intent,
          entities: extracted,
          answer: error.message,
          data: { status: "TIMEOUT" },
          sources: [],
          confidence: 0,
          status: "FAILED",
          processingTimeMs,
        });
        logger.warn({ queryId, userId: input.actor.id, intent: detected.intent, processingTimeMs }, "Assistant query timed out");
        return {
          queryId,
          intent: detected.intent,
          answer: error.message,
          data: { status: "TIMEOUT" },
          sources: [],
          confidence: 0,
        };
      }

      await saveQuery({
        queryId,
        userId: input.actor.id,
        conversationId: input.conversationId,
        message: original,
        intent: detected.intent,
        entities: extracted,
        answer: "I couldn't complete that query.",
        data: { status: "FAILED" },
        sources: [],
        confidence: 0,
        status: "FAILED",
        processingTimeMs,
      });
      logger.warn(
        { err: error, queryId, userId: input.actor.id, intent: detected.intent, processingTimeMs },
        "Assistant query failed",
      );
      if (error instanceof AppError) throw error;
      throw error;
    }
  },
};

function asEmpty(data: Record<string, unknown>): boolean {
  if (typeof data.count === "number") return data.count === 0;
  if (typeof data.pendingTasks === "number") return data.pendingTasks === 0 && Number(data.overdueTasks ?? 0) === 0;
  return false;
}
