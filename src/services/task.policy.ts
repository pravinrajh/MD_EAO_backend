import type { Role } from "../utils/constants";
import { ForbiddenError } from "../utils/errors";

export type Actor = {
  id: string;
  role: Role;
};

export function isPrivileged(role: Role): boolean {
  return role === "MD" || role === "ADMIN";
}

export function canCreateTasks(role: Role): boolean {
  return role === "MD" || role === "ADMIN" || role === "MANAGER";
}

export function canDeleteTasks(role: Role): boolean {
  return isPrivileged(role);
}

export function canAssignTasks(role: Role): boolean {
  return role === "MD" || role === "ADMIN" || role === "MANAGER";
}

export function canIncludeDeleted(role: Role): boolean {
  return isPrivileged(role);
}

export function assertCanCreate(actor: Actor): void {
  if (!canCreateTasks(actor.role)) {
    throw new ForbiddenError("You do not have permission to create tasks");
  }
}

export function assertCanDelete(actor: Actor): void {
  if (!canDeleteTasks(actor.role)) {
    throw new ForbiddenError("You do not have permission to delete tasks");
  }
}

export function assertCanAssign(actor: Actor): void {
  if (!canAssignTasks(actor.role)) {
    throw new ForbiddenError("You do not have permission to assign tasks");
  }
}

export function canAccessAssignee(actor: Actor, assigneeId: string, teamIds: string[] | null): boolean {
  if (isPrivileged(actor.role)) return true;
  if (!teamIds) return false;
  return teamIds.includes(assigneeId);
}

export function canViewTask(
  actor: Actor,
  task: { assignedTo: string; createdBy: string },
  teamIds: string[] | null,
): boolean {
  if (isPrivileged(actor.role)) return true;
  if (task.createdBy === actor.id) return true;
  if (teamIds?.includes(task.assignedTo)) return true;
  return false;
}

export function assertCanViewTask(
  actor: Actor,
  task: { assignedTo: string; createdBy: string },
  teamIds: string[] | null,
): void {
  if (!canViewTask(actor, task, teamIds)) {
    throw new ForbiddenError("You do not have permission to view this task");
  }
}

export function assertCanMutateTask(
  actor: Actor,
  task: { assignedTo: string; createdBy: string },
  teamIds: string[] | null,
): void {
  if (isPrivileged(actor.role)) return;
  if (actor.role === "MANAGER" && teamIds?.includes(task.assignedTo)) return;
  if (actor.role === "EMPLOYEE" && teamIds?.includes(task.assignedTo)) return;
  throw new ForbiddenError("You do not have permission to modify this task");
}
