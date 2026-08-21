import { env } from "../../config/env";
import { ASSISTANT_DEFAULT_MEETING_MINUTES, OPPORTUNITY_STAGES, TASK_PRIORITIES, type AssistantActionIntent } from "../../utils/constants";
import { getZonedDayRange } from "../../utils/timezone";
import { customerService } from "../customer.service";
import { employeeService } from "../employee.service";
import { employeeRepository } from "../../repositories/employee.repository";
import { leadService } from "../lead.service";
import { meetingService } from "../meeting.service";
import { opportunityService } from "../opportunity.service";
import { projectService } from "../project.service";
import { invoiceService } from "../invoice.service";
import { landParcelService } from "../landParcel.service";
import { mdNoteService } from "../mdNote.service";
import { vendorService } from "../vendor.service";
import { normalizeQuery } from "./intentRouter.service";
import { defaultActionEngine } from "./actionEngine";
import { addMinutes, combineDateAndTime, parseNaturalDate, parseNaturalTime } from "./dateParser";
import type {
  ActionActor,
  DetectedActionIntent,
  ExtractedActionEntities,
  ResolvedActionEntities,
} from "./action.types";

const EMPLOYEE_STOP = new Set([
  "the",
  "this",
  "that",
  "our",
  "my",
  "me",
  "a",
  "an",
  "call",
  "it",
  "task",
  "meeting",
  "project",
  "lead",
  "customer",
  "opportunity",
  "reminder",
  "new",
  "all",
]);
const COMPANY_STOP = new Set(["AM", "PM", "HR"]);
const DATE_STOP = new Set([
  "today",
  "tomorrow",
  "yesterday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const DATE_PHRASE =
  /\b(today|tomorrow|yesterday|next week|next monday|next tuesday|next wednesday|next thursday|next friday|next saturday|next sunday|this monday|this tuesday|this wednesday|this thursday|this friday|this saturday|this sunday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

const TIME_PHRASE =
  /\b(?:at\s+)?((?:[01]?\d|2[0-3])(?::[0-5]\d)?(?:\s*(?:am|pm))?)\b/i;

function usable(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 80) return undefined;
  return cleaned;
}

function displayName(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (typeof item[key] === "string" && String(item[key]).trim()) return String(item[key]).trim();
  }
  return String(item.id ?? "");
}

function stripNoise(text: string): string {
  return text
    .replace(DATE_PHRASE, " ")
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectActionIntent(normalized: string): DetectedActionIntent {
  return defaultActionEngine.detectIntent(normalized);
}

export function extractActionEntities(original: string, normalized: string): ExtractedActionEntities {
  const entities: ExtractedActionEntities = {};

  const dateMatch = original.match(DATE_PHRASE);
  if (dateMatch) entities.datePhrase = dateMatch[1].toLowerCase();

  const times = [...original.matchAll(new RegExp(TIME_PHRASE.source, "gi"))];
  if (times[0]?.[1]) entities.timePhrase = times[0][1].trim();
  if (times[1]?.[1]) entities.endTimePhrase = times[1][1].trim();

  if (/\bcritical\b/i.test(normalized)) entities.priority = "CRITICAL";
  else if (/\bhigh\b/i.test(normalized)) entities.priority = "HIGH";
  else if (/\bmedium\b/i.test(normalized)) entities.priority = "MEDIUM";
  else if (/\blow\b/i.test(normalized)) entities.priority = "LOW";

  const progress = original.match(/\bprogress(?:\s+to)?\s+(\d{1,3})\b/i);
  if (progress) {
    const value = Number(progress[1]);
    if (value >= 0 && value <= 100) entities.progress = value;
  }

  const budgetMatch = original.match(/\bbudget(?:\s+to)?\s+(\d{1,12})\b/i);
  if (budgetMatch) {
    const value = Number(budgetMatch[1]);
    if (Number.isInteger(value) && value >= 0) entities.budget = value;
  }

  const stageMatch = original.match(
    /\b(new|qualification|proposal|negotiation|won|lost)\b/i,
  );
  if (stageMatch && OPPORTUNITY_STAGES.includes(stageMatch[1].toUpperCase() as (typeof OPPORTUNITY_STAGES)[number])) {
    entities.stage = stageMatch[1].toUpperCase();
  }

  const statusMatch = original.match(
    /\b(pending|in progress|completed|cancelled|qualified|contacted|active|inactive)\b/i,
  );
  if (statusMatch) entities.status = statusMatch[1].toUpperCase().replace(/\s+/g, "_");

  const employeeMatch =
    original.match(/\b(?:with|assign(?:ed)?(?:\s+it)?(?:\s+to)?)\s+([A-Z][a-zA-Z.'-]{1,40})\b/) ||
    original.match(/\bto\s+([A-Z][a-z]{1,40})\b/) ||
    (/\btasks?\b/.test(normalized) && !/\b(leads?|customers?|projects?|opportunit)/.test(normalized)
      ? original.match(/\bfor\s+([A-Z][a-z]{1,40})\b/)
      : null) ||
    original.match(/\b([A-Za-z][A-Za-z.'-]{1,40}?)(?:'s|’s)\b/);
  if (
    employeeMatch?.[1] &&
    !EMPLOYEE_STOP.has(employeeMatch[1].toLowerCase()) &&
    !DATE_STOP.has(employeeMatch[1].toLowerCase())
  ) {
    entities.employeeName = employeeMatch[1];
  }
  if (!entities.employeeName) {
    const startPerson =
      original.match(/^([A-Za-z][A-Za-z.'-]{1,40})\s+(?:need|needs|meet)\b/i) ||
      normalized.match(/^([a-z]{3,})\s+(?:need|needs|meet)\b/);
    if (startPerson?.[1] && !EMPLOYEE_STOP.has(startPerson[1].toLowerCase()) && !DATE_STOP.has(startPerson[1].toLowerCase())) {
      entities.employeeName = startPerson[1];
    }
  }

  const projectMatch =
    (/\bcreate(?:\s+a)?\s+task\b/.test(normalized)
      ? null
      : original.match(/\b(?:called|named)\s+([A-Za-z0-9][A-Za-z0-9 &'()-]{1,60}?)\s*[.!]?\s*$/i)) ||
    original.match(/\b([A-Z][a-zA-Z0-9]{1,40}(?:\s+[A-Z][a-zA-Z0-9]{1,40})*)\s+projects?\b/);
  if (projectMatch?.[1]) {
    const words = projectMatch[1]
      .split(/\s+/)
      .filter((word) => !["the", "a", "new", "called", "named", "update", "create"].includes(word.toLowerCase()));
    const name = usable(words.slice(-4).join(" "));
    if (name) entities.projectName = name;
  }
  if (!entities.projectName) {
    const lowerProject = normalized.match(/\b([a-z0-9][a-z0-9 -]{1,40}?)\s+projects?\b/);
    if (lowerProject?.[1]) {
      const words = lowerProject[1]
        .split(/\s+/)
        .filter((word) => !["the", "a", "new", "called", "named", "update", "create", "from"].includes(word));
      const name = usable(words.slice(-4).join(" "));
      if (name) entities.projectName = name;
    }
  }

  const companyMatch =
    original.match(/\b(?:for|customer|lead|opportunity)\s+([A-Z][A-Za-z0-9 &.'-]{1,60}?)(?:\s+tomorrow|\s+today|$)/) ||
    original.match(/\b([A-Z]{2,}(?:\s+[A-Z][a-zA-Z]+)*)\b/);
  if (companyMatch?.[1] && !entities.employeeName?.startsWith(companyMatch[1])) {
    const name = usable(companyMatch[1].replace(/\s+(tomorrow|today|lead|opportunity|customer)$/i, ""));
    if (
      name &&
      !COMPANY_STOP.has(name.toUpperCase()) &&
      name.toLowerCase() !== entities.employeeName?.toLowerCase()
    ) {
      if (/\bleads?\b/.test(normalized)) entities.leadName = name;
      else if (/\bopportunit/.test(normalized)) entities.opportunityName = name;
      else if (/\bcustomers?\b/.test(normalized) || /\btasks?\b/.test(normalized)) entities.customerName = name;
      else entities.customerName = name;
    }
  }

  if (!/^create\b/.test(normalized) && !/^schedule\b/.test(normalized)) {
    const taskMatch =
      original.match(/\b(?:assign|mark|complete|update|change)\s+(?:the\s+)?(.+?)\s+tasks?\b/i) ||
      original.match(/\b(?:mark|complete)\s+(?:the\s+)?(.+?)\s+(?:task\s+)?(?:as\s+)?(?:completed|complete|finished)\b/i) ||
      original.match(/\b(?:the\s+)?([a-z0-9][a-z0-9 &.'-]{2,60}?)\s+tasks?\b/i);
    if (taskMatch?.[1]) {
      const cleaned = usable(stripNoise(taskMatch[1]).replace(/^\b(this|the|a|my)\b\s*/i, ""));
      if (cleaned && !["this", "the", "a"].includes(cleaned.toLowerCase())) entities.taskTitle = cleaned;
    }
  }

  const meetingMatch =
    original.match(/\b(?:cancel|move|reschedule|update)\s+(?:tomorrow'?s\s+|today'?s\s+)?(.+?)\s+meetings?\b/i) ||
    original.match(/\bschedule(?:\s+a)?\s+(.+?)(?:\s+tomorrow|\s+today|\s+at\s+|\s+with\s+)/i);
  if (meetingMatch?.[1]) {
    const title = usable(stripNoise(meetingMatch[1]).replace(/^\b(the|a|this)\b\s*/i, ""));
    if (title && !["meeting", "a meeting"].includes(title.toLowerCase())) entities.meetingTitle = title;
  }

  const namedCreateTask = original.match(
    /create(?:\s+a)?\s+task\s+(?:called|named)\s+([A-Za-z0-9][A-Za-z0-9 &'().-]{1,80}?)(?:\s+and\b|\s+assign\b|$|[.!?])/i,
  );
  if (namedCreateTask?.[1]) {
    const named = usable(namedCreateTask[1]);
    if (named) entities.title = named.charAt(0).toUpperCase() + named.slice(1);
  }

  const createTask = original.match(/create(?:\s+a)?\s+task(?:\s+for\s+[A-Za-z]+)?(?:\s+to)?\s+(.+)/i);
  if (!entities.title && createTask?.[1]) {
    let title = stripNoise(createTask[1]);
    if (entities.employeeName) {
      title = title.replace(new RegExp(`\\b(for|to)\\s+${entities.employeeName}\\b`, "i"), "").trim();
    }
    title = title
      .replace(/^\b(?:called|named)\b\s+/i, "")
      .replace(/\s+and\s+assign(?:ed)?(?:\s+it)?(?:\s+to\s+\S+)?.*$/i, "")
      .replace(/^\bto\b\s+/i, "")
      .replace(/\bfor\s+[A-Za-z].*$/i, "")
      .trim();
    if (title) entities.title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  if (!entities.title) {
    const needs = original.match(/\bneeds? to\s+(.+)/i);
    if (needs?.[1]) {
      const title = usable(stripNoise(needs[1]));
      if (title) entities.title = title.charAt(0).toUpperCase() + title.slice(1);
    }
  }
  if (!entities.title && /\bcollect\b/.test(normalized) && entities.projectName) {
    entities.title = `Collect the amount from ${entities.projectName}`;
  }

  const createNamed = original.match(
    /create(?:\s+(?:a|an|new))*\s+(?:project|lead|customer|opportunity|meeting)\s+(?:called |named |for )?(.+)/i,
  );
  if (createNamed?.[1] && !entities.title) {
    const name = usable(stripNoise(createNamed[1]).replace(/^\b(a|an|the|called|named|for)\b\s*/i, ""));
    if (name) {
      if (/\bprojects?\b/.test(normalized)) entities.projectName = name;
      else if (/\bleads?\b/.test(normalized)) entities.leadName = name;
      else if (/\bcustomers?\b/.test(normalized)) entities.customerName = name;
      else if (/\bopportunit/.test(normalized)) entities.title = name;
      else entities.title = name;
    }
  }

  if (/\bremind me(?:\s+to)?\s+(.+)/i.test(original)) {
    const reminder = original.match(/\bremind me(?:\s+to)?\s+(.+)/i);
    if (reminder?.[1]) entities.title = stripNoise(reminder[1]) || "Reminder";
  }

  if (!entities.title && entities.meetingTitle) entities.title = entities.meetingTitle;
  if (!entities.title && entities.employeeName && /schedule|meeting|meet me|\bmeet\b/.test(normalized)) {
    entities.title = `Meeting with ${entities.employeeName}`;
  }

  if (TASK_PRIORITIES.includes(entities.priority as (typeof TASK_PRIORITIES)[number]) === false) {
    if (entities.priority && !TASK_PRIORITIES.includes(entities.priority as never)) {
      delete entities.priority;
    }
  }

  const vendor = original.match(/\bcreate(?:\s+a)?\s+vendor(?:\s+(?:called|named))?\s+(.+)/i);
  if (vendor?.[1]) entities.vendorName = usable(stripNoise(vendor[1]));
  const land = original.match(/\b(?:land (?:opportunity|parcel)|parcel)\s+(?:in\s+)?(.+)/i);
  if (land?.[1] && !entities.parcelName) entities.parcelName = usable(stripNoise(land[1]).replace(/\s+status.*$/i, ""));
  const note = original.match(/(?:add|create)(?:\s+an?)?\s+(?:md\s+)?note:?\s*(.+)/i);
  if (note?.[1]) entities.noteBody = usable(note[1]);
  const amount = original.match(/\b(?:rs|inr|₹)?\s*(\d{3,12})\b/i);
  if (amount?.[1]) entities.amount = Number(amount[1]);

  return entities;
}

export function applyActionConversationEntities(
  extracted: ExtractedActionEntities,
  lastAction: Record<string, unknown> | undefined,
  lastQuery: Record<string, unknown> | undefined,
  normalized: string,
): ExtractedActionEntities {
  const next = { ...extracted };
  const stored = lastAction && typeof lastAction.result === "object" ? (lastAction.result as Record<string, unknown>) : lastAction;
  const nested =
    stored && typeof stored.result === "object" ? (stored.result as Record<string, unknown>) : stored;
  const taskId =
    (typeof nested?.id === "string" && nested.id) ||
    (typeof lastQuery?.taskId === "string" && lastQuery.taskId) ||
    undefined;
  const referringTask =
    /\b(that|this|the)\s+tasks?\b/.test(normalized) ||
    /^(mark|change|complete|delete|remove|update)\b/.test(normalized);
  if (!next.taskTitle && !next.taskId && referringTask && taskId) {
    next.taskId = taskId;
    if (typeof nested?.title === "string") next.taskTitle = nested.title;
  }
  if (!next.projectName && typeof lastQuery?.projectName === "string" && /\b(that|this|the)\s+project\b/.test(normalized)) {
    next.projectName = lastQuery.projectName;
  }
  return next;
}

async function resolveNamedList(
  field: string,
  name: string,
  items: Array<Record<string, unknown>>,
  label: string,
  keys: string[],
): Promise<Partial<ResolvedActionEntities>> {
  if (items.length === 0) return { notFound: { field, name } };
  if (items.length > 1) {
    const question =
      field === "employee"
        ? `I found multiple employees named ${name}. Please select the correct employee.`
        : `I found ${items.length} ${label} matching ${name}. Which one do you mean?`;
    return {
      clarification: {
        field,
        question,
        options: items.slice(0, 5).map((item) => ({ id: String(item.id), name: displayName(item, keys) })),
      },
    };
  }
  return {};
}

export async function resolveActionEntities(
  extracted: ExtractedActionEntities,
  actor: ActionActor,
  options: {
    intent?: AssistantActionIntent;
    needTask?: boolean;
    needMeeting?: boolean;
    needProject?: boolean;
    needEmployee?: boolean;
    needInvoice?: boolean;
    needVendor?: boolean;
    needParcel?: boolean;
    needNote?: boolean;
  } = {},
): Promise<ResolvedActionEntities> {
  const resolved: ResolvedActionEntities = { ...extracted };
  const lookups: Array<Promise<void>> = [];

  if (extracted.datePhrase) {
    const date = parseNaturalDate(extracted.datePhrase);
    const time = parseNaturalTime(extracted.timePhrase);
    const endTime = parseNaturalTime(extracted.endTimePhrase);
    if (date) {
      resolved.dueDate = combineDateAndTime(date, time, env.APP_TIMEZONE, 18);
      resolved.remindAt = resolved.dueDate;
      if (time) {
        resolved.startTime = combineDateAndTime(date, time, env.APP_TIMEZONE);
        resolved.endTime = endTime
          ? combineDateAndTime(date, endTime, env.APP_TIMEZONE)
          : addMinutes(resolved.startTime, ASSISTANT_DEFAULT_MEETING_MINUTES);
      }
    }
  } else if (extracted.timePhrase) {
    const today = parseNaturalDate("today");
    const time = parseNaturalTime(extracted.timePhrase);
    if (today && time) {
      resolved.startTime = combineDateAndTime(today, time, env.APP_TIMEZONE);
      resolved.endTime = addMinutes(resolved.startTime, ASSISTANT_DEFAULT_MEETING_MINUTES);
      resolved.dueDate = combineDateAndTime(today, time, env.APP_TIMEZONE, 18);
    }
  }

  const intent = options.intent;
  if (intent === "CREATE_OPPORTUNITY" && !extracted.customerName) {
    extracted.customerName = extracted.opportunityName || extracted.title || extracted.leadName;
    if (extracted.customerName) resolved.customerName = extracted.customerName;
  }

  if ((extracted.projectName || options.needProject) && intent !== "CREATE_PROJECT" && intent !== "CREATE_MEETING") {
    lookups.push(
      (async () => {
        const result = await projectService.list(
          { search: extracted.projectName, limit: 5, page: 1, sortBy: "name", sortOrder: "asc" },
          actor,
        );
        const items = result.items as Array<Record<string, unknown>>;
        if (extracted.projectName) {
          const named = await resolveNamedList("project", extracted.projectName, items, "projects", ["name"]);
          if (named.notFound || named.clarification) Object.assign(resolved, named);
          else if (items[0]) {
            resolved.projectId = String(items[0].id);
            resolved.projectName = displayName(items[0], ["name"]);
          }
          return;
        }
        if (items.length === 1) {
          resolved.projectId = String(items[0].id);
          resolved.projectName = displayName(items[0], ["name"]);
        } else if (items.length > 1) {
          resolved.clarification = {
            field: "project",
            question: "Which project should I use?",
            options: items.slice(0, 5).map((item) => ({ id: String(item.id), name: displayName(item, ["name"]) })),
          };
        }
      })(),
    );
  }

  if (
    (extracted.employeeName || options.needEmployee) &&
    intent !== "CREATE_LEAD" &&
    intent !== "CREATE_CUSTOMER" &&
    intent !== "CREATE_PROJECT" &&
    intent !== "CREATE_OPPORTUNITY"
  ) {
    lookups.push(
      (async () => {
        if (!extracted.employeeName) {
          const mine = await employeeRepository.findByUserId(actor.id);
          if (mine) {
            resolved.employeeId = String(mine._id);
            resolved.assigneeId = String(mine._id);
          }
          return;
        }
        const result = await employeeService.list({
          search: extracted.employeeName,
          status: "ACTIVE",
          limit: 5,
          page: 1,
          sortBy: "firstName",
          sortOrder: "asc",
        });
        const items = result.items as Array<Record<string, unknown>>;
        const named = await resolveNamedList("employee", extracted.employeeName, items, "employees", [
          "displayName",
          "firstName",
        ]);
        if (named.notFound || named.clarification) Object.assign(resolved, named);
        else if (items[0]) {
          resolved.employeeId = String(items[0].id);
          resolved.assigneeId = String(items[0].id);
          resolved.participantIds = [String(items[0].id)];
          resolved.employeeName = displayName(items[0], ["displayName", "firstName"]);
        }
      })(),
    );
  }

  if (extracted.customerName && intent !== "CREATE_CUSTOMER") {
    lookups.push(
      (async () => {
        const result = await customerService.list({ search: extracted.customerName, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        const named = await resolveNamedList("customer", extracted.customerName as string, items, "customers", [
          "name",
          "companyName",
        ]);
        if (named.clarification) Object.assign(resolved, named);
        else if (items[0]) resolved.customerId = String(items[0].id);
      })(),
    );
  }

  if (extracted.leadName && intent !== "CREATE_LEAD") {
    lookups.push(
      (async () => {
        const result = await leadService.list({ search: extracted.leadName, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        const named = await resolveNamedList("lead", extracted.leadName as string, items, "leads", ["name"]);
        if (named.notFound || named.clarification) Object.assign(resolved, named);
        else if (items[0]) resolved.leadId = String(items[0].id);
      })(),
    );
  }

  if (extracted.opportunityName && intent !== "CREATE_OPPORTUNITY") {
    lookups.push(
      (async () => {
        const result = await opportunityService.list({ search: extracted.opportunityName, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        const named = await resolveNamedList("opportunity", extracted.opportunityName as string, items, "opportunities", [
          "title",
        ]);
        if (named.notFound || named.clarification) Object.assign(resolved, named);
        else if (items[0]) resolved.opportunityId = String(items[0].id);
      })(),
    );
  }

  if ((extracted.invoiceNumber || options.needInvoice) && intent !== "CREATE_INVOICE") {
    lookups.push(
      (async () => {
        const result = await invoiceService.list(
          { search: extracted.invoiceNumber, customerId: resolved.customerId, projectId: resolved.projectId, limit: 5, page: 1 },
          actor,
        );
        const items = result.items as Array<Record<string, unknown>>;
        if (items.length === 1) resolved.invoiceId = String(items[0].id);
        else if (items.length > 1) {
          resolved.clarification = {
            field: "invoice",
            question: "Which invoice should I use?",
            options: items.slice(0, 5).map((item) => ({ id: String(item.id), name: String(item.invoiceNumber ?? item.id) })),
          };
        } else if (extracted.invoiceNumber) {
          resolved.notFound = { field: "invoice", name: extracted.invoiceNumber };
        }
      })(),
    );
  }

  if ((extracted.vendorName || options.needVendor) && intent !== "CREATE_VENDOR") {
    lookups.push(
      (async () => {
        const result = await vendorService.list({ search: extracted.vendorName, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        const named = extracted.vendorName
          ? await resolveNamedList("vendor", extracted.vendorName, items, "vendors", ["name"])
          : {};
        if (named.notFound || named.clarification) Object.assign(resolved, named);
        else if (items[0]) resolved.vendorId = String(items[0].id);
      })(),
    );
  }

  if ((extracted.parcelName || extracted.location || options.needParcel) && intent !== "CREATE_LAND_PARCEL") {
    lookups.push(
      (async () => {
        const result = await landParcelService.list(
          { search: extracted.parcelName, location: extracted.location, limit: 5, page: 1 },
          actor,
        );
        const items = result.items as Array<Record<string, unknown>>;
        if (items.length === 1) resolved.parcelId = String(items[0].id);
        else if (items.length > 1) {
          resolved.clarification = {
            field: "land_parcel",
            question: "Which land parcel should I use?",
            options: items.slice(0, 5).map((item) => ({ id: String(item.id), name: String(item.name ?? item.id) })),
          };
        }
      })(),
    );
  }

  if (options.needNote && intent !== "CREATE_MD_NOTE") {
    lookups.push(
      (async () => {
        const { mdNoteService } = await import("../mdNote.service");
        const result = await mdNoteService.list({ search: extracted.noteBody || extracted.title, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        if (items.length === 1) resolved.noteId = String(items[0].id);
        else if (items.length > 1) {
          resolved.clarification = {
            field: "note",
            question: "Which note should I update?",
            options: items.slice(0, 5).map((item) => ({ id: String(item.id), name: String(item.body ?? item.noteId) })),
          };
        }
      })(),
    );
  }

  if ((extracted.taskTitle || extracted.taskId || options.needTask) && intent !== "CREATE_TASK") {
    lookups.push(
      (async () => {
        if (extracted.taskId) {
          resolved.taskId = extracted.taskId;
          return;
        }
        if (!extracted.taskTitle) return;
        const result = await taskService.list({ search: extracted.taskTitle, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        const named = await resolveNamedList("task", extracted.taskTitle, items, "tasks", ["title"]);
        if (named.notFound || named.clarification) Object.assign(resolved, named);
        else if (items[0]) {
          resolved.taskId = String(items[0].id);
          resolved.taskTitle = String(items[0].title ?? extracted.taskTitle);
        }
      })(),
    );
  }

  if ((extracted.meetingTitle || options.needMeeting) && intent !== "CREATE_MEETING") {
    lookups.push(
      (async () => {
        const query: Record<string, unknown> = { search: extracted.meetingTitle, limit: 5, page: 1, sortBy: "startTime" };
        if (resolved.startTime) {
          const day = getDayBounds(resolved.startTime);
          query.from = day.start;
          query.to = day.end;
        }
        const result = await meetingService.list(query, actor);
        const items = result.items as Array<Record<string, unknown>>;
        if (extracted.meetingTitle) {
          const named = await resolveNamedList("meeting", extracted.meetingTitle, items, "meetings", ["title"]);
          if (named.notFound || named.clarification) Object.assign(resolved, named);
          else if (items[0]) {
            resolved.meetingId = String(items[0].id);
            resolved.meetingTitle = String(items[0].title ?? extracted.meetingTitle);
          }
        } else if (items.length === 1) {
          resolved.meetingId = String(items[0].id);
        } else if (items.length > 1) {
          resolved.clarification = {
            field: "meeting",
            question: "Which meeting do you mean?",
            options: items.slice(0, 5).map((item) => ({ id: String(item.id), name: displayName(item, ["title"]) })),
          };
        }
      })(),
    );
  }

  if (lookups.length > 0) await Promise.all(lookups);
  return resolved;
}

function getDayBounds(date: Date) {
  return getZonedDayRange(date, env.APP_TIMEZONE);
}

export const actionIntentRouterService = {
  normalizeQuery,
  detectActionIntent,
  extractActionEntities,
  resolveActionEntities,
};
