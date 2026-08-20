import { logger } from "../../config/logger";
import { employeeRepository } from "../../repositories/employee.repository";
import { isObjectId } from "../../utils/objectId";
import { notificationService } from "../notification.service";
import { reminderService, type ReminderActor } from "../reminder.service";

function asId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return isObjectId(value) ? value : null;
  if (typeof value === "object") {
    const record = value as { _id?: unknown; id?: unknown; toHexString?: () => string };
    if (typeof record.toHexString === "function") {
      const hex = record.toHexString();
      return isObjectId(hex) ? hex : null;
    }
    if (typeof record.id === "string" && isObjectId(record.id)) return record.id;
    if (record._id) return asId(record._id);
  }
  return null;
}

async function userIdForEmployee(employeeId: unknown): Promise<string | null> {
  const id = asId(employeeId);
  if (!id) return null;
  const employee = await employeeRepository.findById(id);
  return employee?.userId ? String(employee.userId) : null;
}

async function safe(label: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    logger.warn({ err: error, label }, "Reminder/notification hook failed");
  }
}

export async function notifyTaskAssigned(task: Record<string, unknown>, _actor: ReminderActor) {
  await safe("task.assigned", async () => {
    const userId = await userIdForEmployee(task.assignedTo);
    if (!userId) return;
    await notificationService.createNotification({
      recipientId: userId,
      type: "TASK_ASSIGNED",
      title: "Task assigned",
      message: String(task.title ?? "A task was assigned to you"),
      priority: "NORMAL",
      sourceType: "TASK",
      sourceId: String(task._id ?? task.id),
      actionUrl: `/tasks/${String(task._id ?? task.id)}`,
    });
  });
}

export async function hookTaskCreated(task: Record<string, unknown>, actor: ReminderActor) {
  await safe("task.created", async () => {
    const userId = (await userIdForEmployee(task.assignedTo)) ?? actor.id;
    await reminderService.scheduleTaskDue(task, actor, userId);
  });
  await notifyTaskAssigned(task, actor);
}

export async function hookTaskUpdated(task: Record<string, unknown>, actor: ReminderActor, assignedChanged: boolean) {
  await safe("task.updated", async () => {
    const userId = (await userIdForEmployee(task.assignedTo)) ?? actor.id;
    await reminderService.scheduleTaskDue(task, actor, userId);
  });
  if (assignedChanged) await notifyTaskAssigned(task, actor);
}

export async function hookMeetingCreated(meeting: Record<string, unknown>, actor: ReminderActor) {
  await safe("meeting.created", async () => {
    await reminderService.scheduleMeetingReminder(meeting, actor, 15);
    const organizerId = String(meeting.organizerId ?? actor.id);
    await notificationService.createNotification({
      recipientId: organizerId,
      type: "MEETING_CREATED",
      title: "Meeting scheduled",
      message: String(meeting.title ?? "A meeting was scheduled"),
      priority: "NORMAL",
      sourceType: "MEETING",
      sourceId: String(meeting._id ?? meeting.id),
      actionUrl: `/meetings/${String(meeting._id ?? meeting.id)}`,
    });
  });
}

export async function hookMeetingCancelled(meeting: Record<string, unknown>) {
  await safe("meeting.cancelled", async () => {
    const participantIds = ((meeting.participants as unknown[]) ?? []).map(String);
    const employees = participantIds.length
      ? await employeeRepository.findSummariesByIds(participantIds)
      : [];
    const recipientIds = new Set<string>([String(meeting.organizerId)]);
    for (const employee of employees) {
      if (employee.userId) recipientIds.add(String(employee.userId));
    }
    await notificationService.createBulkNotifications(
      [...recipientIds].map((recipientId) => ({
        recipientId,
        type: "MEETING_CANCELLED",
        title: "Meeting cancelled",
        message: String(meeting.title ?? "A meeting was cancelled"),
        priority: "HIGH",
        sourceType: "MEETING",
        sourceId: String(meeting._id ?? meeting.id),
        actionUrl: `/meetings/${String(meeting._id ?? meeting.id)}`,
      })),
    );
  });
}

export async function hookCrmFollowUp(
  doc: Record<string, unknown>,
  actor: ReminderActor,
  sourceType: "LEAD" | "OPPORTUNITY",
) {
  await safe("crm.followUp", async () => {
    const userId = (await userIdForEmployee(doc.assignedTo)) ?? actor.id;
    const name = String(doc.name ?? doc.companyName ?? doc.title ?? "contact");
    await reminderService.scheduleCrmFollowUp(doc, actor, { sourceType, userId, name });
  });
}

export async function hookProjectAtRisk(project: Record<string, unknown>, actor: ReminderActor) {
  await safe("project.atRisk", async () => {
    const userId = (await userIdForEmployee(project.managerId)) ?? actor.id;
    await notificationService.createNotification({
      recipientId: userId,
      type: "PROJECT_AT_RISK",
      title: "Project at risk",
      message: `${String(project.name ?? "Project")} is now at risk`,
      priority: "HIGH",
      sourceType: "PROJECT",
      sourceId: String(project._id ?? project.id),
      actionUrl: `/projects/${String(project._id ?? project.id)}`,
    });
  });
}
