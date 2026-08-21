import type { Role } from "../utils/constants";
import { ForbiddenError } from "../utils/errors";

export type Actor = {
  id: string;
  role: Role;
};

export function isPrivileged(role: Role): boolean {
  return role === "MD" || role === "ADMIN";
}

export function canManageOffice(role: Role): boolean {
  return role === "MD" || role === "ADMIN" || role === "MANAGER";
}

export function canDeleteOffice(role: Role): boolean {
  return isPrivileged(role);
}

export function assertCanManageOffice(actor: Actor, resource = "this record"): void {
  if (!canManageOffice(actor.role)) {
    throw new ForbiddenError(`You do not have permission to manage ${resource}`);
  }
}

export function assertCanDeleteOffice(actor: Actor, resource = "this record"): void {
  if (!canDeleteOffice(actor.role)) {
    throw new ForbiddenError(`You do not have permission to delete ${resource}`);
  }
}

export function assertCanViewOffice(actor: Actor, record: { createdBy: string }, resource = "this record"): void {
  if (isPrivileged(actor.role) || actor.role === "MANAGER") return;
  if (record.createdBy === actor.id) return;
  throw new ForbiddenError(`You do not have permission to view ${resource}`);
}

export function visibilityFilter(actor: Actor): Record<string, unknown> | undefined {
  if (isPrivileged(actor.role) || actor.role === "MANAGER") return undefined;
  return { createdBy: actor.id };
}
