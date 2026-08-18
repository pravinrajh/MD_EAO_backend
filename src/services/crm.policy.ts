import type { Role } from "../utils/constants";
import { ForbiddenError } from "../utils/errors";

export type Actor = {
  id: string;
  role: Role;
};

export function isPrivileged(role: Role): boolean {
  return role === "MD" || role === "ADMIN";
}

export function canCreateCustomers(role: Role): boolean {
  return role === "MD" || role === "ADMIN" || role === "MANAGER";
}

export function canCreateOpportunities(role: Role): boolean {
  return canCreateCustomers(role);
}

export function canDeleteCrm(role: Role): boolean {
  return isPrivileged(role);
}

export function canAssignCrm(role: Role): boolean {
  return role === "MD" || role === "ADMIN" || role === "MANAGER";
}

export function assertCanCreateCustomer(actor: Actor): void {
  if (!canCreateCustomers(actor.role)) {
    throw new ForbiddenError("You do not have permission to create customers");
  }
}

export function assertCanCreateOpportunity(actor: Actor): void {
  if (!canCreateOpportunities(actor.role)) {
    throw new ForbiddenError("You do not have permission to create opportunities");
  }
}

export function assertCanDeleteCrm(actor: Actor): void {
  if (!canDeleteCrm(actor.role)) {
    throw new ForbiddenError("You do not have permission to delete CRM records");
  }
}

export function canAccessAssignee(actor: Actor, assigneeId: string, teamIds: string[] | null): boolean {
  if (isPrivileged(actor.role)) return true;
  if (!teamIds) return false;
  return teamIds.includes(assigneeId);
}

export function canViewAssigned(
  actor: Actor,
  record: { assignedTo: string | null; createdBy: string },
  teamIds: string[] | null,
): boolean {
  if (isPrivileged(actor.role)) return true;
  if (record.createdBy === actor.id) return true;
  if (record.assignedTo && teamIds?.includes(record.assignedTo)) return true;
  return false;
}

export function assertCanViewAssigned(
  actor: Actor,
  record: { assignedTo: string | null; createdBy: string },
  teamIds: string[] | null,
): void {
  if (!canViewAssigned(actor, record, teamIds)) {
    throw new ForbiddenError("You do not have permission to view this record");
  }
}

export function assertCanMutateAssigned(
  actor: Actor,
  record: { assignedTo: string | null; createdBy: string },
  teamIds: string[] | null,
): void {
  if (isPrivileged(actor.role)) return;
  if (record.createdBy === actor.id) return;
  if (record.assignedTo && teamIds?.includes(record.assignedTo)) return;
  throw new ForbiddenError("You do not have permission to modify this record");
}

export function assertCanAssign(actor: Actor, assigneeId: string, teamIds: string[] | null): void {
  if (canAccessAssignee(actor, assigneeId, teamIds)) return;
  throw new ForbiddenError("You cannot assign CRM records to this employee");
}

export function visibilityFilter(actor: Actor, teamIds: string[] | null) {
  if (teamIds === null) return undefined;
  return {
    $or: [{ createdBy: actor.id }, { assignedTo: { $in: teamIds } }],
  };
}

export function activityVisibilityFilter(actor: Actor, teamIds: string[] | null) {
  if (teamIds === null) return undefined;
  return {
    $or: [{ createdBy: actor.id }, { employeeId: { $in: teamIds } }],
  };
}
