import type { Role } from "../utils/constants";
import { ForbiddenError } from "../utils/errors";

export type Actor = {
  id: string;
  role: Role;
};

export function isPrivileged(role: Role): boolean {
  return role === "MD" || role === "ADMIN";
}

export function canCreateProjects(role: Role): boolean {
  return isPrivileged(role);
}

export function canDeleteProjects(role: Role): boolean {
  return isPrivileged(role);
}

export function canChangeProjectManager(role: Role): boolean {
  return isPrivileged(role);
}

export function canUpdateBudget(role: Role): boolean {
  return isPrivileged(role);
}

export function belongsToProject(
  employeeId: string | null,
  project: { managerId: string; members: string[] },
): boolean {
  if (!employeeId) return false;
  return project.managerId === employeeId || project.members.includes(employeeId);
}

export function canViewProject(
  actor: Actor,
  project: { managerId: string; members: string[] },
  employeeId: string | null,
): boolean {
  if (isPrivileged(actor.role)) return true;
  return belongsToProject(employeeId, project);
}

export function canManageProject(
  actor: Actor,
  project: { managerId: string; members: string[] },
  employeeId: string | null,
): boolean {
  if (isPrivileged(actor.role)) return true;
  return actor.role === "MANAGER" && Boolean(employeeId) && project.managerId === employeeId;
}

export function assertCanCreate(actor: Actor): void {
  if (!canCreateProjects(actor.role)) {
    throw new ForbiddenError("You do not have permission to create projects");
  }
}

export function assertCanDelete(actor: Actor): void {
  if (!canDeleteProjects(actor.role)) {
    throw new ForbiddenError("You do not have permission to delete projects");
  }
}

export function assertCanChangeManager(actor: Actor): void {
  if (!canChangeProjectManager(actor.role)) {
    throw new ForbiddenError("You do not have permission to change the project manager");
  }
}

export function assertCanView(
  actor: Actor,
  project: { managerId: string; members: string[] },
  employeeId: string | null,
): void {
  if (!canViewProject(actor, project, employeeId)) {
    throw new ForbiddenError("You do not have permission to view this project");
  }
}

export function assertCanManage(
  actor: Actor,
  project: { managerId: string; members: string[] },
  employeeId: string | null,
): void {
  if (!canManageProject(actor, project, employeeId)) {
    throw new ForbiddenError("You do not have permission to modify this project");
  }
}
