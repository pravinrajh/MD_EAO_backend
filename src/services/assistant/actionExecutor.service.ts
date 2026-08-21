import { env } from "../../config/env";
import type { AssistantActionIntent, OpportunityStage, ProjectStatus, TaskPriority, TaskStatus } from "../../utils/constants";
import { ConflictError, ForbiddenError } from "../../utils/errors";
import { customerService } from "../customer.service";
import { employeeRepository } from "../../repositories/employee.repository";
import { leadService } from "../lead.service";
import { meetingService } from "../meeting.service";
import { opportunityService } from "../opportunity.service";
import { projectService } from "../project.service";
import { reminderService } from "../reminder/reminder.service";
import { invoiceService } from "../invoice.service";
import { vendorService } from "../vendor.service";
import { landParcelService } from "../landParcel.service";
import { mdNoteService } from "../mdNote.service";
import { addMinutes, combineDateAndTime, parseNaturalTime } from "./dateParser";
import type { ActionActor, ActionDto, ResolvedActionEntities } from "./action.types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickTask(task: Record<string, unknown>) {
  return {
    id: task.id,
    taskId: task.taskId,
    title: task.title,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
  };
}

function pickMeeting(meeting: Record<string, unknown>) {
  return {
    id: meeting.id,
    meetingId: meeting.meetingId,
    title: meeting.title,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    status: meeting.status,
  };
}

function pickProject(project: Record<string, unknown>) {
  return {
    id: project.id,
    projectId: project.projectId,
    name: project.name,
    progress: project.progress,
    status: project.status,
  };
}

function pickLead(lead: Record<string, unknown>) {
  return { id: lead.id, leadId: lead.leadId, name: lead.name, status: lead.status };
}

function pickOpportunity(item: Record<string, unknown>) {
  return { id: item.id, opportunityId: item.opportunityId, title: item.title, stage: item.stage };
}

function pickCustomer(item: Record<string, unknown>) {
  return { id: item.id, customerId: item.customerId, name: item.name, status: item.status };
}

function pickReminder(item: Record<string, unknown>) {
  return {
    id: item.id,
    reminderId: item.reminderId,
    title: item.title,
    scheduledAt: item.scheduledAt,
    status: item.status,
    priority: item.priority,
  };
}

async function actorEmployeeId(actor: ActionActor): Promise<string | null> {
  const mine = await employeeRepository.findByUserId(actor.id);
  return mine ? String(mine._id) : null;
}

async function createTask(actor: ActionActor, entities: ResolvedActionEntities) {
  const assignedTo = entities.assigneeId ?? entities.employeeId ?? (await actorEmployeeId(actor));
  if (!assignedTo) {
    throw new Error("CLARIFICATION:Who should I assign this task to?");
  }
  if (!entities.title) {
    throw new Error("CLARIFICATION:What should I title the task?");
  }
  const created = asRecord(
    await taskService.create(
      {
        title: entities.title.slice(0, 200),
        description: entities.description,
        assignedTo,
        projectId: entities.projectId ?? null,
        customerId: entities.customerId ?? null,
        priority: (entities.priority as TaskPriority) ?? "MEDIUM",
        dueDate: entities.dueDate,
      },
      actor,
    ),
  );
  const taskId = String(created.id ?? "");
  const assigned =
    entities.assigneeId && taskId
      ? asRecord(await taskService.assign(taskId, entities.assigneeId, actor))
      : created;
  const title = String(assigned.title ?? created.title ?? entities.title);
  const who = (entities.employeeName ?? "").split(/\s+/)[0];
  if (who) {
    return {
      message: `Task '${title}' was created and assigned to ${who} successfully.`,
      result: pickTask(assigned),
    };
  }
  return { message: "Task created successfully.", result: pickTask(assigned) };
}

async function updateTask(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.taskId) throw new Error("CLARIFICATION:Which task should I update?");
  const dto: {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: Date;
    assignedTo?: string;
    projectId?: string | null;
  } = {};
  if (entities.title) dto.title = entities.title;
  if (entities.description) dto.description = entities.description;
  if (entities.priority) dto.priority = entities.priority as TaskPriority;
  if (entities.dueDate) dto.dueDate = entities.dueDate;
  if (entities.assigneeId) dto.assignedTo = entities.assigneeId;
  if (entities.projectId) dto.projectId = entities.projectId;
  if (Object.keys(dto).length === 0 && !entities.status) throw new Error("CLARIFICATION:What should I change on this task?");
  let updated = asRecord(await taskService.update(entities.taskId, dto, actor));
  if (entities.status && ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(entities.status)) {
    updated = asRecord(
      await taskService.updateStatus(entities.taskId, { status: entities.status as TaskStatus }, actor),
    );
  }
  return { message: "Task updated successfully.", result: pickTask(updated) };
}

async function assignTask(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.taskId) throw new Error("CLARIFICATION:Which task should I assign?");
  if (!entities.assigneeId) throw new Error("CLARIFICATION:Who should I assign the task to?");
  const updated = asRecord(await taskService.assign(entities.taskId, entities.assigneeId, actor));
  return {
    message: `${entities.taskTitle ?? "Task"} has been assigned to ${entities.employeeName ?? "the selected employee"}.`,
    result: pickTask(updated),
  };
}

async function completeTask(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.taskId) throw new Error("CLARIFICATION:Which task should I mark completed?");
  const current = asRecord(await taskService.getById(entities.taskId, actor));
  if (current.status === "PENDING") {
    await taskService.updateStatus(entities.taskId, { status: "IN_PROGRESS" }, actor);
  }
  const updated = asRecord(
    await taskService.updateStatus(entities.taskId, { status: "COMPLETED" as TaskStatus }, actor),
  );
  return { message: "Task marked as completed.", result: pickTask(updated) };
}

async function deleteTask(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.taskId) throw new Error("CLARIFICATION:Which task should I delete?");
  const removed = asRecord(await taskService.remove(entities.taskId, actor));
  return { message: "Task deleted successfully.", result: pickTask(removed) };
}

async function createMeeting(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.startTime) throw new Error("CLARIFICATION:What time should I schedule the meeting?");
  if (!entities.endTime) throw new Error("CLARIFICATION:What time should the meeting end?");
  const title = (entities.title || entities.meetingTitle || "Meeting").slice(0, 200);
  const participants = [...(entities.participantIds && entities.participantIds.length > 0
    ? entities.participantIds
    : entities.employeeId
      ? [entities.employeeId]
      : [])];
  if (participants.length === 0) {
    const mine = await actorEmployeeId(actor);
    if (mine) participants.push(mine);
  }
  if (participants.length === 0) {
    throw new Error("CLARIFICATION:Who should attend this meeting?");
  }
  try {
    const created = asRecord(
      await meetingService.create(
        {
          title,
          description: entities.description,
          meetingType: "INTERNAL",
          participants,
          projectId: entities.projectId ?? null,
          location: entities.location,
          startTime: entities.startTime,
          endTime: entities.endTime,
          timezone: env.APP_TIMEZONE,
        },
        actor,
      ),
    );
    return { message: "Meeting scheduled successfully.", result: pickMeeting(created) };
  } catch (error) {
    if (error instanceof ConflictError) {
      throw new Error("CLARIFICATION:That time conflicts with an existing meeting. Would you like a later slot instead?");
    }
    throw error;
  }
}

async function updateMeeting(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.meetingId) throw new Error("CLARIFICATION:Which meeting should I update?");
  const current = asRecord(await meetingService.getById(entities.meetingId, actor));
  if (entities.startTime && !entities.datePhrase && current.startTime) {
    const existing = new Date(String(current.startTime));
    const time = parseNaturalTime(entities.timePhrase);
    if (time) entities.startTime = combineDateAndTime(existing, time, env.APP_TIMEZONE);
    if (entities.startTime && !entities.endTimePhrase) {
      entities.endTime = addMinutes(entities.startTime, 60);
    }
  }
  const dto: Record<string, unknown> = {};
  if (entities.title) dto.title = entities.title;
  if (entities.startTime) dto.startTime = entities.startTime;
  if (entities.endTime) dto.endTime = entities.endTime;
  if (entities.participantIds) dto.participants = entities.participantIds;
  if (entities.location) dto.location = entities.location;
  if (entities.description) dto.description = entities.description;
  if (Object.keys(dto).length === 0) throw new Error("CLARIFICATION:What should I change on this meeting?");
  try {
    const updated = asRecord(await meetingService.update(entities.meetingId, dto, actor));
    return { message: "Meeting updated successfully.", result: pickMeeting(updated) };
  } catch (error) {
    if (error instanceof ConflictError) {
      throw new Error("CLARIFICATION:That time conflicts with an existing meeting. Would you like a later slot instead?");
    }
    throw error;
  }
}

async function cancelMeeting(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.meetingId) throw new Error("CLARIFICATION:Which meeting should I cancel?");
  const cancelled = asRecord(
    await meetingService.cancel(entities.meetingId, "Cancelled via Assistant", actor),
  );
  return { message: "Meeting cancelled successfully.", result: pickMeeting(cancelled) };
}

async function createProject(actor: ActionActor, entities: ResolvedActionEntities) {
  const name = entities.projectName || entities.title;
  if (!name) throw new Error("CLARIFICATION:What should I name the project?");
  const managerId = entities.employeeId ?? (await actorEmployeeId(actor));
  if (!managerId) throw new Error("CLARIFICATION:Who should manage this project?");
  const created = asRecord(
    await projectService.create(
      {
        name: name.slice(0, 160),
        projectType: "OTHER",
        managerId,
      },
      actor,
    ),
  );
  return { message: "Project created successfully.", result: pickProject(created) };
}

async function updateProject(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.projectId) throw new Error("CLARIFICATION:Which project should I update?");
  if (typeof entities.budget === "number") {
    const updated = asRecord(await projectService.update(entities.projectId, { budget: entities.budget }, actor));
    return { message: "Project updated successfully.", result: pickProject(updated) };
  }
  const dto: { progress?: number; status?: ProjectStatus; name?: string } = {};
  if (typeof entities.progress === "number") dto.progress = entities.progress;
  if (entities.status && ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "AT_RISK"].includes(entities.status)) {
    dto.status = entities.status as ProjectStatus;
  }
  if (entities.title && !dto.progress) dto.name = entities.title;
  if (dto.status && (dto.status === "COMPLETED" || dto.status === "CANCELLED")) {
    const updated = asRecord(await projectService.updateStatus(entities.projectId, dto.status, actor));
    return { message: "Project updated successfully.", result: pickProject(updated) };
  }
  if (Object.keys(dto).length === 0) throw new Error("CLARIFICATION:What should I change on this project?");
  const updated = asRecord(await projectService.update(entities.projectId, dto, actor));
  return { message: "Project updated successfully.", result: pickProject(updated) };
}

async function createLead(actor: ActionActor, entities: ResolvedActionEntities) {
  const name = entities.leadName || entities.customerName || entities.title;
  if (!name) throw new Error("CLARIFICATION:What is the lead's name?");
  const created = asRecord(
    await leadService.create(
      {
        name: name.slice(0, 160),
        companyName: name,
        source: "PHONE",
        priority: "MEDIUM",
        assignedTo: entities.assigneeId,
      },
      actor,
    ),
  );
  return { message: "Lead created successfully.", result: pickLead(created) };
}

async function updateLead(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.leadId) throw new Error("CLARIFICATION:Which lead should I update?");
  if (entities.status && ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "LOST"].includes(entities.status)) {
    const updated = asRecord(await leadService.updateStatus(entities.leadId, entities.status as never, actor));
    return { message: "Lead updated successfully.", result: pickLead(updated) };
  }
  const dto: { name?: string; description?: string } = {};
  if (entities.title) dto.name = entities.title;
  if (entities.description) dto.description = entities.description;
  if (Object.keys(dto).length === 0) throw new Error("CLARIFICATION:What should I change on this lead?");
  const updated = asRecord(await leadService.update(entities.leadId, dto, actor));
  return { message: "Lead updated successfully.", result: pickLead(updated) };
}

async function createOpportunity(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.customerId) throw new Error("CLARIFICATION:Which customer is this opportunity for?");
  const title = entities.title || entities.opportunityName || `${entities.customerName ?? "Customer"} opportunity`;
  const created = asRecord(
    await opportunityService.create(
      {
        title: title.slice(0, 200),
        customerId: entities.customerId,
        assignedTo: entities.assigneeId,
        estimatedValue: 0,
      },
      actor,
    ),
  );
  return { message: "Opportunity created successfully.", result: pickOpportunity(created) };
}

async function updateOpportunity(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.opportunityId) throw new Error("CLARIFICATION:Which opportunity should I update?");
  if (entities.stage) {
    const updated = asRecord(
      await opportunityService.updateStage(entities.opportunityId, { stage: entities.stage as OpportunityStage }, actor),
    );
    return { message: "Opportunity updated successfully.", result: pickOpportunity(updated) };
  }
  const dto: { title?: string; description?: string } = {};
  if (entities.title) dto.title = entities.title;
  if (entities.description) dto.description = entities.description;
  if (Object.keys(dto).length === 0) throw new Error("CLARIFICATION:What should I change on this opportunity?");
  const updated = asRecord(await opportunityService.update(entities.opportunityId, dto, actor));
  return { message: "Opportunity updated successfully.", result: pickOpportunity(updated) };
}

async function createCustomer(actor: ActionActor, entities: ResolvedActionEntities) {
  const name = entities.customerName || entities.title;
  if (!name) throw new Error("CLARIFICATION:What is the customer's name?");
  const created = asRecord(
    await customerService.create(
      {
        name: name.slice(0, 160),
        companyName: name,
        assignedTo: entities.assigneeId,
      },
      actor,
    ),
  );
  return { message: "Customer created successfully.", result: pickCustomer(created) };
}

async function updateCustomer(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.customerId) throw new Error("CLARIFICATION:Which customer should I update?");
  if (entities.status && ["ACTIVE", "INACTIVE", "BLOCKED"].includes(entities.status)) {
    const updated = asRecord(await customerService.updateStatus(entities.customerId, entities.status as never, actor));
    return { message: "Customer updated successfully.", result: pickCustomer(updated) };
  }
  const dto: { name?: string; notes?: string } = {};
  if (entities.title) dto.name = entities.title;
  if (entities.description) dto.notes = entities.description;
  if (Object.keys(dto).length === 0) throw new Error("CLARIFICATION:What should I change on this customer?");
  const updated = asRecord(await customerService.update(entities.customerId, dto, actor));
  return { message: "Customer updated successfully.", result: pickCustomer(updated) };
}

async function createReminder(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.remindAt && !entities.dueDate) {
    throw new Error("CLARIFICATION:When should I remind you?");
  }
  const created = asRecord(
    await reminderService.createReminder(
      {
        title: (entities.title || "Reminder").slice(0, 200),
        remindAt: (entities.remindAt ?? entities.dueDate) as Date,
        message: entities.description,
      },
      actor,
    ),
  );
  return { message: "Reminder created successfully.", result: pickReminder(created) };
}

async function createInvoice(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.customerId) throw new Error("CLARIFICATION:Which customer is this invoice for?");
  if (!entities.amount) throw new Error("CLARIFICATION:What amount should I put on the invoice?");
  const created = asRecord(
    await invoiceService.create(
      {
        customerId: entities.customerId,
        projectId: entities.projectId ?? null,
        amount: entities.amount,
        dueDate: entities.dueDate,
        description: entities.description || entities.title,
      },
      actor,
    ),
  );
  return { message: `Invoice ${created.invoiceNumber ?? ""} was created.`, result: created };
}

async function updateInvoice(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.invoiceId) throw new Error("CLARIFICATION:Which invoice should I update?");
  const updated = asRecord(
    await invoiceService.update(entities.invoiceId, { description: entities.description, status: entities.status === "CANCELLED" ? "CANCELLED" : undefined }, actor),
  );
  return { message: "Invoice updated successfully.", result: updated };
}

async function recordInvoicePayment(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.invoiceId) throw new Error("CLARIFICATION:Which invoice should I record a payment against?");
  if (!entities.amount) throw new Error("CLARIFICATION:What amount was paid?");
  const updated = asRecord(await invoiceService.recordPayment(entities.invoiceId, { amount: entities.amount }, actor));
  return { message: "Payment recorded on the invoice. Cash was not posted to finance accounts.", result: updated };
}

async function createVendor(actor: ActionActor, entities: ResolvedActionEntities) {
  const name = entities.vendorName || entities.title;
  if (!name) throw new Error("CLARIFICATION:What is the vendor name?");
  const created = asRecord(await vendorService.create({ name, location: entities.location }, actor));
  return { message: `Vendor '${name}' was created.`, result: created };
}

async function updateVendor(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.vendorId) throw new Error("CLARIFICATION:Which vendor should I update?");
  const updated = asRecord(
    await vendorService.update(entities.vendorId, { name: entities.vendorName, location: entities.location, status: entities.status as "ACTIVE" | "INACTIVE" | undefined }, actor),
  );
  return { message: "Vendor updated successfully.", result: updated };
}

async function createLandParcel(actor: ActionActor, entities: ResolvedActionEntities) {
  const name = entities.parcelName || entities.title || entities.location;
  if (!name) throw new Error("CLARIFICATION:What should I name the land parcel?");
  const created = asRecord(
    await landParcelService.create(
      {
        name: name.slice(0, 160),
        location: entities.location || entities.parcelName,
        projectId: entities.projectId ?? null,
        askingPrice: entities.amount,
      },
      actor,
    ),
  );
  return { message: `Land parcel '${name}' was created.`, result: created };
}

async function updateLandParcel(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.parcelId) throw new Error("CLARIFICATION:Which land parcel should I update?");
  const status = entities.status as "AVAILABLE" | "NEGOTIATION" | "LEGAL_VERIFICATION" | "ACQUIRED" | "DROPPED" | undefined;
  const mapped =
    status && ["AVAILABLE", "NEGOTIATION", "LEGAL_VERIFICATION", "ACQUIRED", "DROPPED"].includes(status)
      ? status
      : /\blegal\b/.test(String(entities.title ?? "").toLowerCase())
        ? "LEGAL_VERIFICATION"
        : undefined;
  const updated = asRecord(
    await landParcelService.update(entities.parcelId, { status: mapped, location: entities.location, name: entities.parcelName }, actor),
  );
  return { message: "Land parcel updated successfully.", result: updated };
}

async function createMdNote(actor: ActionActor, entities: ResolvedActionEntities) {
  const body = entities.noteBody || entities.title || entities.description;
  if (!body) throw new Error("CLARIFICATION:What should the note say?");
  const relatedType = entities.projectId ? "PROJECT" : entities.customerId ? "CUSTOMER" : entities.employeeId ? "EMPLOYEE" : "NONE";
  const relatedId = entities.projectId || entities.customerId || entities.employeeId || null;
  const created = asRecord(await mdNoteService.create({ body, relatedType, relatedId }, actor));
  return { message: "MD note saved.", result: created };
}

async function updateMdNote(actor: ActionActor, entities: ResolvedActionEntities) {
  if (!entities.noteId) throw new Error("CLARIFICATION:Which note should I update?");
  const body = entities.noteBody || entities.title || entities.description;
  const updated = asRecord(await mdNoteService.update(entities.noteId, { body }, actor));
  return { message: "Note updated successfully.", result: updated };
}

const EXECUTORS: Record<
  Exclude<AssistantActionIntent, "UNSUPPORTED">,
  (actor: ActionActor, entities: ResolvedActionEntities) => Promise<{ message: string; result: ActionDto }>
> = {
  CREATE_TASK: createTask,
  UPDATE_TASK: updateTask,
  ASSIGN_TASK: assignTask,
  COMPLETE_TASK: completeTask,
  CREATE_MEETING: createMeeting,
  UPDATE_MEETING: updateMeeting,
  CANCEL_MEETING: cancelMeeting,
  CREATE_PROJECT: createProject,
  UPDATE_PROJECT: updateProject,
  CREATE_LEAD: createLead,
  UPDATE_LEAD: updateLead,
  CREATE_OPPORTUNITY: createOpportunity,
  UPDATE_OPPORTUNITY: updateOpportunity,
  CREATE_CUSTOMER: createCustomer,
  UPDATE_CUSTOMER: updateCustomer,
  CREATE_REMINDER: createReminder,
  DELETE_TASK: deleteTask,
  CREATE_INVOICE: createInvoice,
  UPDATE_INVOICE: updateInvoice,
  RECORD_INVOICE_PAYMENT: recordInvoicePayment,
  CREATE_VENDOR: createVendor,
  UPDATE_VENDOR: updateVendor,
  CREATE_LAND_PARCEL: createLandParcel,
  UPDATE_LAND_PARCEL: updateLandParcel,
  CREATE_MD_NOTE: createMdNote,
  UPDATE_MD_NOTE: updateMdNote,
};

export function confirmationFor(
  intent: AssistantActionIntent,
  entities: ResolvedActionEntities,
): { required: boolean; message?: string } {
  if (intent === "DELETE_TASK") {
    return {
      required: true,
      message: `Do you want me to delete ${entities.taskTitle ?? "this task"}? This cannot be undone from chat.`,
    };
  }
    const title = entities.meetingTitle || "this meeting";
    return {
      required: true,
      message: `${title} is on the calendar. Do you want me to cancel it?`,
    };
  }
  if (intent === "UPDATE_PROJECT" && (entities.status === "CANCELLED" || entities.status === "COMPLETED")) {
    return {
      required: true,
      message: `This will change ${entities.projectName ?? "the project"} to ${entities.status}. Do you want me to continue?`,
    };
  }
  return { required: false };
}

export const actionExecutorService = {
  confirmationFor,

  async execute(intent: AssistantActionIntent, actor: ActionActor, entities: ResolvedActionEntities) {
    if (intent === "UNSUPPORTED") {
      return {
        message: "I can't perform that action.",
        result: {},
      };
    }
    try {
      return await EXECUTORS[intent](actor, entities);
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw new Error(`UNAUTHORIZED:${error.message}`);
      }
      throw error;
    }
  },
};
