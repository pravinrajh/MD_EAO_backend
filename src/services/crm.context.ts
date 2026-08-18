import { employeeRepository } from "../repositories/employee.repository";
import { userRepository } from "../repositories/user.repository";
import { BadRequestError, ForbiddenError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { type Actor, canAccessAssignee, isPrivileged } from "./crm.policy";

export async function resolveCrmScope(actor: Actor): Promise<{ teamIds: string[] | null; employeeId: string | null }> {
  if (isPrivileged(actor.role)) {
    const mine = await employeeRepository.findByUserId(actor.id);
    return { teamIds: null, employeeId: mine ? String(mine._id) : null };
  }

  const mine = await employeeRepository.findByUserId(actor.id);
  const employeeId = mine ? String(mine._id) : null;

  if (actor.role === "EMPLOYEE") {
    return { teamIds: employeeId ? [employeeId] : [], employeeId };
  }

  if (!employeeId) {
    return { teamIds: [], employeeId: null };
  }

  const reports = await employeeRepository.findReportIds(employeeId);
  return {
    teamIds: [employeeId, ...reports.map((row) => String(row._id))],
    employeeId,
  };
}

export async function assertAssignableEmployee(actor: Actor, employeeId: string, teamIds: string[] | null) {
  assertObjectId(employeeId, "assignedTo");
  const employee = await employeeRepository.findById(employeeId);
  if (!employee) {
    throw new BadRequestError("Assigned employee not found", [
      { field: "assignedTo", message: "Employee must exist" },
    ]);
  }
  if (employee.status !== "ACTIVE") {
    throw new BadRequestError("Assigned employee is not active", [
      { field: "assignedTo", message: "Employee must be ACTIVE" },
    ]);
  }
  if (!canAccessAssignee(actor, employeeId, teamIds)) {
    throw new ForbiddenError("You cannot assign CRM records to this employee");
  }
  return employee;
}

export function employeeSummary(employee: {
  _id?: unknown;
  id?: unknown;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
} | null) {
  if (!employee) return null;
  const name =
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() ||
    "Unknown";
  return {
    id: String(employee._id ?? employee.id),
    name,
    employeeCode: employee.employeeCode ?? "",
  };
}

export function creatorSummary(user: { _id?: unknown; id?: unknown; name?: string; email?: string; role?: string } | null) {
  if (!user) return null;
  return {
    id: String(user._id ?? user.id),
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role ?? "",
  };
}

export async function hydrateAssignedRecords<T extends Record<string, unknown>>(
  records: T[],
  options: { assignedField?: string; includeCreator?: boolean } = {},
) {
  const assignedField = options.assignedField ?? "assignedTo";
  const assigneeIds = [...new Set(records.map((item) => String(item[assignedField] ?? "")).filter(Boolean))];
  const creatorIds = options.includeCreator
    ? [...new Set(records.map((item) => String(item.createdBy ?? "")).filter(Boolean))]
    : [];

  const [employees, users] = await Promise.all([
    employeeRepository.findSummariesByIds(assigneeIds),
    options.includeCreator ? userRepository.findSummariesByIds(creatorIds) : Promise.resolve([]),
  ]);

  const employeesById = new Map(employees.map((item) => [String(item._id), item]));
  const usersById = new Map(users.map((item) => [String(item._id), item]));

  return records.map((record) => {
    const assigned = employeesById.get(String(record[assignedField] ?? ""));
    const created = usersById.get(String(record.createdBy ?? ""));
    return {
      ...record,
      [assignedField]: employeeSummary(assigned ?? null) ?? record[assignedField] ?? null,
      createdBy: options.includeCreator ? (creatorSummary(created ?? null) ?? record.createdBy) : record.createdBy,
    };
  });
}

export const ID_RETRIES = 3;
