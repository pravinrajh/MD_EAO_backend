import type { Role } from "../utils/constants";
import { ForbiddenError } from "../utils/errors";

export type Actor = {
  id: string;
  role: Role;
};

export function isPrivileged(role: Role): boolean {
  return role === "MD" || role === "ADMIN";
}

export function canCreateMeetings(role: Role): boolean {
  return role === "MD" || role === "ADMIN" || role === "MANAGER";
}

export function canDeleteMeetings(role: Role): boolean {
  return isPrivileged(role);
}

export function canViewMeeting(
  actor: Actor,
  meeting: { organizerId: string; participants: string[]; projectId: string | null },
  employeeId: string | null,
  managedProjectIds: string[],
): boolean {
  if (isPrivileged(actor.role)) return true;
  if (meeting.organizerId === actor.id) return true;
  if (employeeId && meeting.participants.includes(employeeId)) return true;
  if (meeting.projectId && managedProjectIds.includes(meeting.projectId)) return true;
  return false;
}

export function canManageMeeting(
  actor: Actor,
  meeting: { organizerId: string; projectId: string | null },
  managedProjectIds: string[],
): boolean {
  if (isPrivileged(actor.role)) return true;
  if (meeting.organizerId === actor.id) return true;
  if (actor.role === "MANAGER" && meeting.projectId && managedProjectIds.includes(meeting.projectId)) {
    return true;
  }
  return false;
}

export function assertCanCreate(actor: Actor): void {
  if (!canCreateMeetings(actor.role)) {
    throw new ForbiddenError("You do not have permission to create meetings");
  }
}

export function assertCanDelete(actor: Actor): void {
  if (!canDeleteMeetings(actor.role)) {
    throw new ForbiddenError("You do not have permission to delete meetings");
  }
}

export function assertCanView(
  actor: Actor,
  meeting: { organizerId: string; participants: string[]; projectId: string | null },
  employeeId: string | null,
  managedProjectIds: string[],
): void {
  if (!canViewMeeting(actor, meeting, employeeId, managedProjectIds)) {
    throw new ForbiddenError("You do not have permission to view this meeting");
  }
}

export function assertCanManage(
  actor: Actor,
  meeting: { organizerId: string; projectId: string | null },
  managedProjectIds: string[],
): void {
  if (!canManageMeeting(actor, meeting, managedProjectIds)) {
    throw new ForbiddenError("You do not have permission to modify this meeting");
  }
}
