import type { Role } from "../utils/constants";
import { ForbiddenError } from "../utils/errors";

export type Actor = {
  id: string;
  role: Role;
};

export function isPrivileged(role: Role): boolean {
  return role === "MD" || role === "ADMIN";
}

export function canManageChartOfAccounts(role: Role): boolean {
  return isPrivileged(role);
}

export function canPostCompanyFinance(role: Role): boolean {
  return isPrivileged(role);
}

export function canPostProjectFinance(role: Role): boolean {
  return role === "MD" || role === "ADMIN" || role === "MANAGER";
}

export function canTransfer(role: Role): boolean {
  return isPrivileged(role);
}

export function canManageCompanyBudgets(role: Role): boolean {
  return isPrivileged(role);
}

export function assertCanManageAccounts(actor: Actor): void {
  if (!canManageChartOfAccounts(actor.role)) {
    throw new ForbiddenError("You do not have permission to manage finance accounts");
  }
}

export function assertCanManageCategories(actor: Actor): void {
  if (!canManageChartOfAccounts(actor.role)) {
    throw new ForbiddenError("You do not have permission to manage finance categories");
  }
}

export function assertCanTransfer(actor: Actor): void {
  if (!canTransfer(actor.role)) {
    throw new ForbiddenError("You do not have permission to transfer between accounts");
  }
}

export function assertCanViewCompanyFinance(actor: Actor): void {
  if (!isPrivileged(actor.role)) {
    throw new ForbiddenError("You do not have permission to view company-wide finance");
  }
}

export function visibilityFilter(actor: Actor, projectIds: string[] | null) {
  if (projectIds === null) return undefined;
  if (projectIds.length === 0) {
    return { createdBy: actor.id };
  }
  return {
    $or: [{ createdBy: actor.id }, { projectId: { $in: projectIds } }],
  };
}
