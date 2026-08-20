import { env } from "../config/env";
import { logger } from "../config/logger";
import { employeeRepository } from "../repositories/employee.repository";
import { projectRepository } from "../repositories/project.repository";
import { taskRepository, type TaskSortField } from "../repositories/task.repository";
import { userRepository } from "../repositories/user.repository";
import type { TaskPriority, TaskStatus } from "../utils/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextTaskId } from "../utils/sequence";
import { getZonedDayRange } from "../utils/timezone";
import {
  type Actor,
  assertCanAssign,
  assertCanCreate,
  assertCanDelete,
  assertCanMutateTask,
  assertCanViewTask,
  canAccessAssignee,
  canIncludeDeleted,
  isPrivileged,
} from "./task.policy";
import { assertCanView as assertCanViewProject } from "./project.policy";
import { hookTaskCreated, hookTaskUpdated } from "./reminder/hooks";

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const TASK_CODE_RETRIES = 3;

type CreateTaskInput = {
  title: string;
  description?: string;
  assignedTo: string;
  projectId?: string | null;
  priority: TaskPriority;
  dueDate?: Date;
  reminderAt?: Date;
};

type UpdateTaskInput = {
  title?: string;
  description?: string;
  assignedTo?: string;
  projectId?: string | null;
  priority?: TaskPriority;
  dueDate?: Date;
  reminderAt?: Date;
};

function isDuplicateKey(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || (error as { code?: number }).code !== 11000) {
    return false;
  }
  const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern;
  const keyValue = (error as { keyValue?: Record<string, unknown> }).keyValue;
  return Boolean(keyPattern?.[field] || keyValue?.[field]);
}

function assigneeSummary(employee: {
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

function creatorSummary(user: { _id?: unknown; id?: unknown; name?: string; email?: string; role?: string } | null) {
  if (!user) return null;
  return {
    id: String(user._id ?? user.id),
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role ?? "",
  };
}

function parseTaskQuery(query: Record<string, unknown>) {
  return {
    search: typeof query.search === "string" ? query.search : undefined,
    status: query.status as TaskStatus | undefined,
    priority: query.priority as TaskPriority | undefined,
    assignedTo: typeof query.assignedTo === "string" ? query.assignedTo : undefined,
    createdBy: typeof query.createdBy === "string" ? query.createdBy : undefined,
    projectId: typeof query.projectId === "string" ? query.projectId : undefined,
    dueFrom: query.dueFrom instanceof Date ? query.dueFrom : undefined,
    dueTo: query.dueTo instanceof Date ? query.dueTo : undefined,
    overdue: query.overdue === true,
    includeDeleted: query.includeDeleted === true,
    sortBy: (query.sortBy as TaskSortField | undefined) ?? "createdAt",
    sortOrder: query.sortOrder === "asc" ? ("asc" as const) : ("desc" as const),
  };
}

async function resolveScope(actor: Actor): Promise<{ teamIds: string[] | null; employeeId: string | null }> {
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

function visibilityFilter(actor: Actor, teamIds: string[] | null) {
  if (teamIds === null) return undefined;
  return {
    $or: [{ createdBy: actor.id }, { assignedTo: { $in: teamIds } }],
  };
}

async function assertAssignableEmployee(actor: Actor, employeeId: string, teamIds: string[] | null) {
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
    throw new ForbiddenError("You cannot assign tasks to this employee");
  }
  return employee;
}

async function assertProjectLink(projectId: string | null | undefined, actor: Actor) {
  if (!projectId) return;
  assertObjectId(projectId, "projectId");
  const project = await projectRepository.findById(projectId);
  if (!project || project.isDeleted) {
    throw new BadRequestError("Project not found", [{ field: "projectId", message: "Project must exist" }]);
  }
  if (project.status === "COMPLETED" || project.status === "CANCELLED") {
    throw new ConflictError("Tasks cannot be linked to a completed or cancelled project");
  }
  const mine = await employeeRepository.findByUserId(actor.id);
  assertCanViewProject(
    actor,
    {
      managerId: String(project.managerId),
      members: (project.members ?? []).map((member) => String(member)),
    },
    mine ? String(mine._id) : null,
  );
}

export async function hydrateTaskRecords(tasks: Record<string, unknown>[], detailed = false) {
  const assigneeIds = [...new Set(tasks.map((task) => String(task.assignedTo)).filter(Boolean))];
  const creatorIds = [...new Set(tasks.map((task) => String(task.createdBy)).filter(Boolean))];

  const [employees, users] = await Promise.all([
    employeeRepository.findSummariesByIds(assigneeIds),
    detailed ? userRepository.findSummariesByIds(creatorIds) : Promise.resolve([]),
  ]);

  const employeesById = new Map(employees.map((item) => [String(item._id), item]));
  const usersById = new Map(users.map((item) => [String(item._id), item]));

  return tasks.map((task) => {
    const assigned = employeesById.get(String(task.assignedTo));
    const created = usersById.get(String(task.createdBy));
    return {
      ...task,
      assignedTo: assigneeSummary(assigned ?? null) ?? task.assignedTo,
      createdBy: detailed ? (creatorSummary(created ?? null) ?? task.createdBy) : task.createdBy,
    };
  });
}

async function loadTaskOrThrow(id: string) {
  assertObjectId(id);
  const task = await taskRepository.findById(id);
  if (!task) throw new NotFoundError("Task not found");
  return task;
}

function publicId(task: { _id?: unknown; id?: unknown }) {
  return String(task._id ?? task.id);
}

export const taskService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const parsed = parseTaskQuery(query);
    const { teamIds } = await resolveScope(actor);

    if (parsed.includeDeleted && !canIncludeDeleted(actor.role)) {
      throw new ForbiddenError("You cannot view deleted tasks");
    }

    if (parsed.assignedTo && !canAccessAssignee(actor, parsed.assignedTo, teamIds) && !isPrivileged(actor.role)) {
      throw new ForbiddenError("You cannot filter tasks for that employee");
    }

    const result = await taskRepository.list({
      ...parsed,
      scope: visibilityFilter(actor, teamIds),
      skip,
      limit,
    });

    return {
      items: await hydrateTaskRecords(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async myTasks(query: Record<string, unknown>, actor: Actor) {
    const { employeeId } = await resolveScope(actor);
    if (!employeeId) {
      const { page, limit } = parsePagination(query);
      return { items: [], meta: buildPaginationMeta(page, limit, 0) };
    }

    return this.list(
      {
        ...query,
        assignedTo: employeeId,
        createdBy: undefined,
      },
      actor,
    );
  },

  async createdByMe(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const parsed = parseTaskQuery(query);

    const result = await taskRepository.list({
      ...parsed,
      createdBy: actor.id,
      assignedTo: undefined,
      includeDeleted: parsed.includeDeleted && canIncludeDeleted(actor.role),
      skip,
      limit,
    });

    return {
      items: await hydrateTaskRecords(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async overdue(query: Record<string, unknown>, actor: Actor) {
    return this.list(
      {
        ...query,
        overdue: true,
        sortBy: query.sortBy ?? "dueDate",
        sortOrder: query.sortOrder ?? "asc",
      },
      actor,
    );
  },

  async today(query: Record<string, unknown>, actor: Actor) {
    const { start, end } = getZonedDayRange(new Date(), env.APP_TIMEZONE);
    const { page, limit, skip } = parsePagination(query);
    const parsed = parseTaskQuery(query);
    const { teamIds } = await resolveScope(actor);

    const result = await taskRepository.list({
      ...parsed,
      scope: visibilityFilter(actor, teamIds),
      dueStart: start,
      dueEndExclusive: end,
      skip,
      limit,
      sortBy: parsed.sortBy === "createdAt" && !query.sortBy ? "dueDate" : parsed.sortBy,
      sortOrder: query.sortOrder === "desc" ? "desc" : "asc",
    });

    return {
      items: await hydrateTaskRecords(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async counts(actor: Actor) {
    const { teamIds } = await resolveScope(actor);
    return taskRepository.counts(visibilityFilter(actor, teamIds));
  },

  async getById(id: string, actor: Actor) {
    const task = await loadTaskOrThrow(id);
    const { teamIds } = await resolveScope(actor);

    if (task.isDeleted && !canIncludeDeleted(actor.role)) {
      throw new NotFoundError("Task not found");
    }

    const publicTask = taskRepository.toPublic(task);
    assertCanViewTask(
      actor,
      { assignedTo: String(publicTask.assignedTo), createdBy: String(publicTask.createdBy) },
      teamIds,
    );

    const [hydrated] = await hydrateTaskRecords([publicTask], true);
    return hydrated;
  },

  async create(input: CreateTaskInput, actor: Actor) {
    assertCanCreate(actor);
    const { teamIds } = await resolveScope(actor);
    await assertAssignableEmployee(actor, input.assignedTo, teamIds);
    await assertProjectLink(input.projectId, actor);

    if (input.reminderAt && input.dueDate && input.reminderAt.getTime() > input.dueDate.getTime()) {
      throw new BadRequestError("reminderAt must be on or before dueDate");
    }

    let created = null;
    for (let attempt = 0; attempt < TASK_CODE_RETRIES; attempt += 1) {
      try {
        created = await taskRepository.create({
          taskId: await nextTaskId(),
          title: input.title,
          description: input.description ?? "",
          assignedTo: input.assignedTo,
          createdBy: actor.id,
          projectId: input.projectId ?? null,
          priority: input.priority,
          status: "PENDING",
          dueDate: input.dueDate ?? null,
          reminderAt: input.reminderAt ?? null,
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "taskId") && attempt < TASK_CODE_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      throw new ConflictError("Unable to generate a unique task ID");
    }

    logger.info({ taskId: created.taskId, createdBy: actor.id }, "Task created");
    const result = await this.getById(publicId(created), actor);
    await hookTaskCreated(
      {
        _id: created._id,
        id: publicId(created),
        taskId: created.taskId,
        title: created.title,
        description: created.description,
        dueDate: created.dueDate,
        reminderAt: created.reminderAt,
        assignedTo: input.assignedTo,
        priority: created.priority,
      },
      actor,
    );
    return result;
  },

  async update(id: string, input: UpdateTaskInput, actor: Actor) {
    const task = await loadTaskOrThrow(id);
    if (task.isDeleted) throw new NotFoundError("Task not found");

    const { teamIds } = await resolveScope(actor);
    const publicTask = taskRepository.toPublic(task);
    assertCanMutateTask(
      actor,
      { assignedTo: String(publicTask.assignedTo), createdBy: String(publicTask.createdBy) },
      teamIds,
    );

    if (input.assignedTo) {
      assertCanAssign(actor);
      await assertAssignableEmployee(actor, input.assignedTo, teamIds);
    } else if (actor.role === "EMPLOYEE" && (input.priority || input.projectId !== undefined)) {
      throw new ForbiddenError("Employees cannot change assignment, priority, or project");
    }

    if (input.projectId !== undefined) {
      await assertProjectLink(input.projectId, actor);
    }

    const dueDate = input.dueDate === undefined ? task.dueDate : input.dueDate;
    const reminderAt = input.reminderAt === undefined ? task.reminderAt : input.reminderAt;
    if (reminderAt && dueDate && new Date(reminderAt).getTime() > new Date(dueDate).getTime()) {
      throw new BadRequestError("reminderAt must be on or before dueDate");
    }

    const patch: Record<string, unknown> = { ...input };
    const updated = await taskRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Task not found");
    logger.info({ taskId: updated.taskId }, "Task updated");
    const result = await this.getById(id, actor);
    if (input.dueDate !== undefined || input.reminderAt !== undefined || input.assignedTo) {
      await hookTaskUpdated(
        {
          _id: updated._id,
          id,
          taskId: updated.taskId,
          title: updated.title,
          description: updated.description,
          dueDate: updated.dueDate,
          reminderAt: updated.reminderAt,
          assignedTo: updated.assignedTo,
          priority: updated.priority,
        },
        actor,
        Boolean(input.assignedTo),
      );
    }
    return result;
  },

  async assign(id: string, assignedTo: string, actor: Actor) {
    assertCanAssign(actor);
    return this.update(id, { assignedTo }, actor);
  },

  async updateStatus(
    id: string,
    input: { status: TaskStatus; completionNote?: string; reason?: string },
    actor: Actor,
  ) {
    const task = await loadTaskOrThrow(id);
    if (task.isDeleted) throw new NotFoundError("Task not found");

    const { teamIds } = await resolveScope(actor);
    const publicTask = taskRepository.toPublic(task);
    assertCanMutateTask(
      actor,
      { assignedTo: String(publicTask.assignedTo), createdBy: String(publicTask.createdBy) },
      teamIds,
    );

    const allowed = ALLOWED_TRANSITIONS[task.status];
    if (!allowed.includes(input.status)) {
      throw new ConflictError(`Cannot change status from ${task.status} to ${input.status}`);
    }

    const patch: Record<string, unknown> = { status: input.status };

    if (input.status === "IN_PROGRESS" && !task.startedAt) {
      patch.startedAt = new Date();
    }
    if (input.status === "COMPLETED") {
      patch.completedAt = new Date();
      if (input.completionNote !== undefined) patch.completionNote = input.completionNote;
    }
    if (input.status === "CANCELLED") {
      patch.cancelledAt = new Date();
      if (input.reason !== undefined) patch.cancellationReason = input.reason;
    }

    const updated = await taskRepository.updateByIdIfStatus(id, task.status, patch);
    if (!updated) {
      throw new ConflictError("Task was updated concurrently");
    }
    logger.info({ taskId: updated.taskId, status: input.status }, "Task status updated");
    return this.getById(id, actor);
  },

  async remove(id: string, actor: Actor) {
    assertCanDelete(actor);
    const task = await loadTaskOrThrow(id);
    if (task.isDeleted) throw new NotFoundError("Task not found");

    const updated = await taskRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Task not found");
    logger.info({ taskId: updated.taskId, deletedBy: actor.id }, "Task soft-deleted");
    return taskRepository.toPublic(updated);
  },
};
