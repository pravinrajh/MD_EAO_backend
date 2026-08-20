import { logger } from "../config/logger";
import { employeeRepository } from "../repositories/employee.repository";
import { projectRepository, type ProjectSortField } from "../repositories/project.repository";
import { taskRepository } from "../repositories/task.repository";
import { hydrateTaskRecords } from "./task.service";
import type { ProjectStatus, ProjectType } from "../utils/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextProjectId } from "../utils/sequence";
import { projectHealth, remainingBudget } from "./project.health";

export { projectHealth, remainingBudget } from "./project.health";
import {
  type Actor,
  assertCanChangeManager,
  assertCanCreate,
  assertCanDelete,
  assertCanManage,
  assertCanView,
  canUpdateBudget,
  isPrivileged,
} from "./project.policy";
import { hookProjectAtRisk } from "./reminder/hooks";

const PROJECT_CODE_RETRIES = 3;

const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  PLANNING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  AT_RISK: ["ACTIVE", "ON_HOLD", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const CLOSED_STATUSES: ProjectStatus[] = ["COMPLETED", "CANCELLED"];

type CreateProjectInput = {
  name: string;
  code?: string;
  description?: string;
  location?: string;
  projectType: ProjectType;
  managerId: string;
  members?: string[];
  status?: ProjectStatus;
  progress?: number;
  budget?: number;
  startDate?: Date;
  expectedEndDate?: Date;
};

type UpdateProjectInput = Partial<CreateProjectInput>;

function isDuplicateKey(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || (error as { code?: number }).code !== 11000) {
    return false;
  }
  const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern;
  const keyValue = (error as { keyValue?: Record<string, unknown> }).keyValue;
  return Boolean(keyPattern?.[field] || keyValue?.[field]);
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function employeeSummary(employee: {
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

function asProject(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    managerId: String(record.managerId),
    members: Array.isArray(record.members) ? record.members.map((member) => String(member)) : [],
    status: record.status as ProjectStatus,
    isDeleted: Boolean(record.isDeleted),
    budget: Number(record.budget ?? 0),
    actualExpense: Number(record.actualExpense ?? 0),
    progress: Number(record.progress ?? 0),
    code: typeof record.code === "string" ? record.code : "",
  };
}

async function actorEmployeeId(actor: Actor): Promise<string | null> {
  const employee = await employeeRepository.findByUserId(actor.id);
  return employee ? String(employee._id) : null;
}

function visibilityScope(employeeId: string | null, privileged: boolean) {
  if (privileged) return undefined;
  if (!employeeId) {
    return { _id: { $exists: false } };
  }
  return {
    $or: [{ managerId: employeeId }, { members: employeeId }],
  };
}

async function assertActiveEmployee(id: string, field: string) {
  assertObjectId(id, field);
  const employee = await employeeRepository.findById(id);
  if (!employee) {
    throw new BadRequestError("Employee not found", [{ field, message: "Employee must exist" }]);
  }
  if (employee.status !== "ACTIVE") {
    throw new BadRequestError("Employee is not active", [{ field, message: "Employee must be ACTIVE" }]);
  }
  return employee;
}

async function assertActiveEmployees(ids: string[], field: string) {
  const unique = uniqueIds(ids);
  const found = await employeeRepository.findSummariesByIds(unique);
  if (found.length !== unique.length) {
    throw new BadRequestError("One or more employees were not found", [
      { field, message: "Every member must exist" },
    ]);
  }
  const inactive = found.filter((item) => item.status !== "ACTIVE");
  if (inactive.length > 0) {
    throw new BadRequestError("One or more employees are not active", [
      { field, message: "Every member must be ACTIVE" },
    ]);
  }
  return unique;
}

async function assertUniqueCode(code: string | undefined, excludeId?: string) {
  if (!code) return;
  const existing = await projectRepository.findByCode(code);
  if (existing && String(existing._id) !== excludeId) {
    throw new ConflictError("Project code is already in use");
  }
}

async function loadProject(id: string) {
  assertObjectId(id);
  const project = await projectRepository.findById(id);
  if (!project || project.isDeleted) throw new NotFoundError("Project not found");
  return projectRepository.toPublic(project);
}

function assertNotClosed(status: ProjectStatus, action = "updated") {
  if (CLOSED_STATUSES.includes(status)) {
    throw new ConflictError(`Completed or cancelled projects cannot be ${action}`);
  }
}

async function hydrate(projects: Record<string, unknown>[], withMembers = false): Promise<Record<string, unknown>[]> {
  const managerIds = [...new Set(projects.map((project) => String(project.managerId)).filter(Boolean))];
  const memberIds = withMembers
    ? [...new Set(projects.flatMap((project) => (Array.isArray(project.members) ? project.members.map(String) : [])))]
    : [];
  const employees = await employeeRepository.findSummariesByIds([...new Set([...managerIds, ...memberIds])]);
  const byId = new Map(employees.map((item) => [String(item._id), item]));

  return projects.map((project) => {
    const manager = employeeSummary(byId.get(String(project.managerId)) ?? null);
    const members = withMembers
      ? (Array.isArray(project.members) ? project.members : [])
          .map((id) => employeeSummary(byId.get(String(id)) ?? null))
          .filter(Boolean)
      : undefined;
    return {
      ...project,
      manager,
      ...(withMembers ? { members } : {}),
    };
  });
}

export const projectService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const employeeId = await actorEmployeeId(actor);

    const result = await projectRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      status: query.status as ProjectStatus | undefined,
      projectType: query.projectType as ProjectType | undefined,
      managerId: typeof query.managerId === "string" ? query.managerId : undefined,
      location: typeof query.location === "string" ? query.location : undefined,
      scope: visibilityScope(employeeId, isPrivileged(actor.role)),
      skip,
      limit,
      sortBy: (query.sortBy as ProjectSortField | undefined) ?? "createdAt",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
    });

    return {
      items: await hydrate(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string, actor: Actor) {
    const project = await loadProject(id);
    const employeeId = await actorEmployeeId(actor);
    assertCanView(actor, asProject(project), employeeId);
    const [hydrated] = await hydrate([project], true);
    return hydrated;
  },

  async create(input: CreateProjectInput, actor: Actor) {
    assertCanCreate(actor);
    await assertActiveEmployee(input.managerId, "managerId");
    const members = await assertActiveEmployees(input.members ?? [], "members");
    const code = input.code?.trim() ? input.code.trim().toUpperCase() : "";
    await assertUniqueCode(code || undefined);

    const status = input.status ?? "PLANNING";
    const progress = status === "COMPLETED" ? 100 : (input.progress ?? 0);

    let created = null;
    for (let attempt = 0; attempt < PROJECT_CODE_RETRIES; attempt += 1) {
      try {
        created = await projectRepository.create({
          projectId: await nextProjectId(),
          name: input.name,
          code,
          description: input.description ?? "",
          location: input.location ?? "",
          projectType: input.projectType,
          managerId: input.managerId,
          members,
          status,
          progress,
          budget: input.budget ?? 0,
          actualExpense: 0,
          startDate: input.startDate ?? null,
          expectedEndDate: input.expectedEndDate ?? null,
          completedAt: status === "COMPLETED" ? new Date() : null,
          createdBy: actor.id,
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "code")) {
          throw new ConflictError("Project code is already in use");
        }
        if (isDuplicateKey(error, "projectId") && attempt < PROJECT_CODE_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    if (!created) throw new ConflictError("Unable to generate a unique project ID");
    logger.info({ projectId: created.projectId, createdBy: actor.id }, "Project created");
    return this.getById(String(created._id), actor);
  },

  async update(id: string, input: UpdateProjectInput, actor: Actor) {
    const project = await loadProject(id);
    const employeeId = await actorEmployeeId(actor);
    assertCanManage(actor, asProject(project), employeeId);
    assertNotClosed(asProject(project).status);

    if (input.budget !== undefined && !canUpdateBudget(actor.role)) {
      throw new ForbiddenError("You do not have permission to modify the project budget");
    }
    if (input.managerId && !isPrivileged(actor.role)) {
      throw new ForbiddenError("You do not have permission to change the project manager");
    }
    if (input.managerId) {
      await assertActiveEmployee(input.managerId, "managerId");
    }
    if (input.members) {
      input.members = await assertActiveEmployees(input.members, "members");
    }
    if (input.code !== undefined) {
      await assertUniqueCode(input.code || undefined, id);
    }

    const startDate = input.startDate === undefined ? (project.startDate as Date | null) : input.startDate;
    const expectedEndDate =
      input.expectedEndDate === undefined ? (project.expectedEndDate as Date | null) : input.expectedEndDate;
    if (startDate && expectedEndDate && new Date(expectedEndDate).getTime() < new Date(startDate).getTime()) {
      throw new BadRequestError("expectedEndDate cannot be before startDate");
    }

    const updated = await projectRepository.updateById(id, {
      ...input,
      code: input.code === undefined ? undefined : input.code,
    });
    if (!updated) throw new NotFoundError("Project not found");
    logger.info({ projectId: updated.projectId }, "Project updated");
    return this.getById(id, actor);
  },

  async updateStatus(id: string, status: ProjectStatus, actor: Actor) {
    const project = await loadProject(id);
    const employeeId = await actorEmployeeId(actor);
    assertCanManage(actor, asProject(project), employeeId);

    const current = asProject(project).status;
    if (!ALLOWED_TRANSITIONS[current].includes(status)) {
      throw new ConflictError(`Cannot change status from ${current} to ${status}`);
    }

    const patch: Record<string, unknown> = { status };
    if (status === "COMPLETED") {
      patch.progress = 100;
      patch.completedAt = new Date();
    }

    const updated = await projectRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Project not found");
    logger.info({ projectId: updated.projectId, status }, "Project status updated");
    const result = await this.getById(id, actor);
    if (status === "AT_RISK") {
      await hookProjectAtRisk(
        {
          _id: updated._id,
          id,
          name: updated.name,
          managerId: updated.managerId,
        },
        actor,
      );
    }
    return result;
  },

  async updateManager(id: string, managerId: string, actor: Actor) {
    assertCanChangeManager(actor);
    const project = await loadProject(id);
    assertNotClosed(asProject(project).status, "reassigned");
    await assertActiveEmployee(managerId, "managerId");
    const updated = await projectRepository.updateById(id, { managerId });
    if (!updated) throw new NotFoundError("Project not found");
    return this.getById(id, actor);
  },

  async updateMembers(id: string, members: string[], actor: Actor) {
    const project = await loadProject(id);
    const employeeId = await actorEmployeeId(actor);
    assertCanManage(actor, asProject(project), employeeId);
    assertNotClosed(asProject(project).status, "updated");
    const unique = await assertActiveEmployees(members, "members");
    const updated = await projectRepository.updateById(id, { members: unique });
    if (!updated) throw new NotFoundError("Project not found");
    return this.getById(id, actor);
  },

  async remove(id: string, actor: Actor) {
    assertCanDelete(actor);
    const project = await loadProject(id);
    const updated = await projectRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Project not found");
    logger.info({ projectId: asProject(project).id, deletedBy: actor.id }, "Project soft-deleted");
    return projectRepository.toPublic(updated);
  },

  async listTasks(id: string, query: Record<string, unknown>, actor: Actor) {
    await this.getById(id, actor);
    const { page, limit, skip } = parsePagination(query);
    const result = await taskRepository.list({
      projectId: id,
      status: query.status as never,
      priority: query.priority as never,
      assignedTo: typeof query.assignedTo === "string" ? query.assignedTo : undefined,
      skip,
      limit,
      sortBy: (query.sortBy as "createdAt" | "dueDate" | "priority" | "status" | "taskId" | "title") ?? "dueDate",
      sortOrder: query.sortOrder === "desc" ? "desc" : "asc",
    });

    return {
      items: await hydrateTaskRecords(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async taskSummary(id: string, actor: Actor) {
    await this.getById(id, actor);
    return taskRepository.counts({ projectId: id });
  },

  async summary(id: string, actor: Actor) {
    const project = await this.getById(id, actor);
    const tasks = await taskRepository.counts({ projectId: id });
    const budget = Number(project.budget ?? 0);
    const actualExpense = Number(project.actualExpense ?? 0);
    const remaining = remainingBudget(budget, actualExpense);

    return {
      project: {
        id: project.id,
        projectId: project.projectId,
        name: project.name,
        status: project.status,
        progress: project.progress,
        location: project.location,
        projectType: project.projectType,
        startDate: project.startDate,
        expectedEndDate: project.expectedEndDate,
        completedAt: project.completedAt,
        manager: project.manager,
        health: projectHealth({
          status: project.status as ProjectStatus,
          remainingBudget: remaining,
          overdueTasks: tasks.overdue,
          budget,
          actualExpense,
        }),
      },
      financial: {
        budget,
        actualExpense,
        remainingBudget: remaining,
      },
      tasks: {
        total: tasks.total,
        pending: tasks.pending,
        inProgress: tasks.inProgress,
        completed: tasks.completed,
        cancelled: tasks.cancelled,
        overdue: tasks.overdue,
      },
    };
  },
};
