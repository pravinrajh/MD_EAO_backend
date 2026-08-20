import { env } from "../config/env";
import { logger } from "../config/logger";
import { employeeRepository } from "../repositories/employee.repository";
import { meetingRepository, type MeetingSortField } from "../repositories/meeting.repository";
import { projectRepository } from "../repositories/project.repository";
import { userRepository } from "../repositories/user.repository";
import type { MeetingStatus, MeetingType } from "../utils/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextMeetingId } from "../utils/sequence";
import { getZonedDayRange } from "../utils/timezone";
import { canViewProject } from "./project.policy";
import {
  type Actor,
  assertCanCreate,
  assertCanDelete,
  assertCanManage,
  assertCanView,
  isPrivileged,
} from "./meeting.policy";
import { hookMeetingCancelled, hookMeetingCreated } from "./reminder/hooks";

const MEETING_ID_RETRIES = 3;
const CLOSED_STATUSES: MeetingStatus[] = ["COMPLETED", "CANCELLED"];

const ALLOWED_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

type CreateMeetingInput = {
  title: string;
  description?: string;
  meetingType: MeetingType;
  participants?: string[];
  projectId?: string | null;
  location?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
};

type UpdateMeetingInput = Partial<CreateMeetingInput> & { notes?: string };

type ExtraFilters = {
  overlapStart?: Date;
  overlapEnd?: Date;
  startFrom?: Date;
  startToExclusive?: Date;
  excludeCancelled?: boolean;
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function isDuplicateKey(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || (error as { code?: number }).code !== 11000) {
    return false;
  }
  const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern;
  const keyValue = (error as { keyValue?: Record<string, unknown> }).keyValue;
  return Boolean(keyPattern?.[field] || keyValue?.[field]);
}

function assertTimeRange(startTime: Date, endTime: Date): void {
  if (startTime.getTime() >= endTime.getTime()) {
    throw new BadRequestError("startTime must be before endTime", [
      { field: "endTime", message: "endTime must be after startTime" },
    ]);
  }
}

function asMeeting(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    organizerId: String(record.organizerId),
    participants: Array.isArray(record.participants) ? record.participants.map((item) => String(item)) : [],
    projectId: record.projectId ? String(record.projectId) : null,
    status: record.status as MeetingStatus,
  };
}

function organizerSummary(user: { _id?: unknown; id?: unknown; name?: string } | null) {
  if (!user) return null;
  return { id: String(user._id ?? user.id), name: user.name ?? "" };
}

function participantSummary(employee: {
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
  return { id: String(employee._id ?? employee.id), name, employeeCode: employee.employeeCode ?? "" };
}

async function actorContext(actor: Actor) {
  const employee = await employeeRepository.findByUserId(actor.id);
  const employeeId = employee ? String(employee._id) : null;
  const managed = employeeId ? await projectRepository.findIdsByManager(employeeId) : [];
  return {
    employeeId,
    managedProjectIds: managed.map((row) => String(row._id)),
  };
}

function visibilityScope(actor: Actor, employeeId: string | null, managedProjectIds: string[]) {
  if (isPrivileged(actor.role)) return undefined;
  const clauses: Record<string, unknown>[] = [{ organizerId: actor.id }];
  if (employeeId) clauses.push({ participants: employeeId });
  if (managedProjectIds.length > 0) clauses.push({ projectId: { $in: managedProjectIds } });
  return { $or: clauses };
}

async function assertActiveParticipants(ids: string[]) {
  const unique = uniqueIds(ids);
  const found = await employeeRepository.findSummariesByIds(unique);
  if (found.length !== unique.length) {
    throw new BadRequestError("One or more participants were not found", [
      { field: "participants", message: "Every participant must exist" },
    ]);
  }
  if (found.some((item) => item.status !== "ACTIVE")) {
    throw new BadRequestError("One or more participants are not active", [
      { field: "participants", message: "Every participant must be ACTIVE" },
    ]);
  }
  return unique;
}

async function assertUsableProject(projectId: string | null | undefined, actor: Actor, employeeId: string | null) {
  if (!projectId) return null;
  assertObjectId(projectId, "projectId");
  const project = await projectRepository.findById(projectId);
  if (!project || project.isDeleted) {
    throw new BadRequestError("Project not found", [{ field: "projectId", message: "Project must exist" }]);
  }
  if (project.status === "CANCELLED") {
    throw new ConflictError("Cancelled projects cannot receive new meetings");
  }
  const allowed = canViewProject(
    actor,
    {
      managerId: String(project.managerId),
      members: (project.members ?? []).map((member) => String(member)),
    },
    employeeId,
  );
  if (!allowed) {
    throw new ForbiddenError("You cannot attach meetings to this project");
  }
  return project;
}

async function assertNoConflicts(participantIds: string[], startTime: Date, endTime: Date, excludeId?: string) {
  const overlapping = await meetingRepository.findConflicts({
    participantIds,
    startTime,
    endTime,
    excludeId,
  });
  if (overlapping.length === 0) return;

  const errors: Record<string, unknown>[] = [];
  for (const meeting of overlapping) {
    const members = (meeting.participants ?? []).map((item) => String(item));
    for (const employeeId of participantIds) {
      if (!members.includes(employeeId)) continue;
      errors.push({
        employeeId,
        meetingId: meeting.meetingId,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
      });
    }
  }
  if (errors.length > 0) {
    throw new ConflictError("Meeting conflict detected", errors);
  }
}

async function rejectLostConflictRace(
  meetingId: string,
  participantIds: string[],
  startTime: Date,
  endTime: Date,
) {
  const overlapping = await meetingRepository.findConflicts({
    participantIds,
    startTime,
    endTime,
    excludeId: meetingId,
  });
  if (overlapping.length === 0) return;

  const lost = overlapping.some((meeting) => String(meeting._id) < meetingId);
  if (!lost) return;

  await meetingRepository.updateById(meetingId, {
    isDeleted: true,
    deletedAt: new Date(),
  });

  const errors: Record<string, unknown>[] = [];
  for (const meeting of overlapping) {
    const members = (meeting.participants ?? []).map((item) => String(item));
    for (const employeeId of participantIds) {
      if (!members.includes(employeeId)) continue;
      errors.push({
        employeeId,
        meetingId: meeting.meetingId,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
      });
    }
  }
  throw new ConflictError("Meeting conflict detected", errors);
}

async function loadMeeting(id: string) {
  assertObjectId(id);
  const meeting = await meetingRepository.findById(id);
  if (!meeting || meeting.isDeleted) throw new NotFoundError("Meeting not found");
  return meetingRepository.toPublic(meeting);
}

async function hydrate(meetings: Record<string, unknown>[]) {
  const organizerIds = [...new Set(meetings.map((item) => String(item.organizerId)).filter(Boolean))];
  const participantIds = [
    ...new Set(meetings.flatMap((item) => (Array.isArray(item.participants) ? item.participants.map(String) : []))),
  ];
  const projectIds = [...new Set(meetings.map((item) => (item.projectId ? String(item.projectId) : "")).filter(Boolean))];

  const [users, employees, projects] = await Promise.all([
    userRepository.findSummariesByIds(organizerIds),
    employeeRepository.findSummariesByIds(participantIds),
    projectRepository.findSummariesByIds(projectIds),
  ]);

  const usersById = new Map(users.map((item) => [String(item._id), item]));
  const employeesById = new Map(employees.map((item) => [String(item._id), item]));
  const projectsById = new Map(projects.map((item) => [String(item._id), item]));

  return meetings.map((meeting) => {
    const project = meeting.projectId ? projectsById.get(String(meeting.projectId)) : null;
    return {
      ...meeting,
      organizer: organizerSummary(usersById.get(String(meeting.organizerId)) ?? null),
      participants: (Array.isArray(meeting.participants) ? meeting.participants : [])
        .map((id) => participantSummary(employeesById.get(String(id)) ?? null))
        .filter(Boolean),
      project: project ? { id: String(project._id), name: project.name, projectId: project.projectId } : null,
    };
  });
}

function parseListQuery(query: Record<string, unknown>) {
  return {
    search: typeof query.search === "string" ? query.search : undefined,
    status: query.status as MeetingStatus | undefined,
    meetingType: query.meetingType as MeetingType | undefined,
    organizerId: typeof query.organizerId === "string" ? query.organizerId : undefined,
    participantId: typeof query.participantId === "string" ? query.participantId : undefined,
    projectId: typeof query.projectId === "string" ? query.projectId : undefined,
    from: query.from instanceof Date ? query.from : undefined,
    to: query.to instanceof Date ? query.to : undefined,
    sortBy: (query.sortBy as MeetingSortField | undefined) ?? "startTime",
    sortOrder: (query.sortOrder as "asc" | "desc" | undefined) ?? "asc",
  };
}

async function listMeetings(query: Record<string, unknown>, actor: Actor, extra: ExtraFilters = {}) {
  const { page, limit, skip } = parsePagination(query);
  const parsed = parseListQuery(query);
  const { employeeId, managedProjectIds } = await actorContext(actor);
  const result = await meetingRepository.list({
    ...parsed,
    ...extra,
    scope: visibilityScope(actor, employeeId, managedProjectIds),
    skip,
    limit,
  });
  return {
    items: await hydrate(result.items),
    meta: buildPaginationMeta(page, limit, result.total),
  };
}

export const meetingService = {
  list(query: Record<string, unknown>, actor: Actor) {
    return listMeetings(query, actor);
  },

  async getById(id: string, actor: Actor) {
    const meeting = await loadMeeting(id);
    const { employeeId, managedProjectIds } = await actorContext(actor);
    assertCanView(actor, asMeeting(meeting), employeeId, managedProjectIds);
    const [hydrated] = await hydrate([meeting]);
    return hydrated;
  },

  async create(input: CreateMeetingInput, actor: Actor) {
    assertCanCreate(actor);
    assertTimeRange(input.startTime, input.endTime);
    const { employeeId } = await actorContext(actor);
    const participants = await assertActiveParticipants(input.participants ?? []);
    await assertUsableProject(input.projectId, actor, employeeId);
    await assertNoConflicts(participants, input.startTime, input.endTime);

    let created = null;
    for (let attempt = 0; attempt < MEETING_ID_RETRIES; attempt += 1) {
      try {
        created = await meetingRepository.create({
          meetingId: await nextMeetingId(),
          title: input.title,
          description: input.description ?? "",
          meetingType: input.meetingType,
          organizerId: actor.id,
          createdBy: actor.id,
          participants,
          projectId: input.projectId ?? null,
          location: input.location ?? "",
          startTime: input.startTime,
          endTime: input.endTime,
          timezone: input.timezone,
          status: "SCHEDULED",
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "meetingId") && attempt < MEETING_ID_RETRIES - 1) continue;
        throw error;
      }
    }

    if (!created) throw new ConflictError("Unable to generate a unique meeting ID");
    await rejectLostConflictRace(String(created._id), participants, input.startTime, input.endTime);
    logger.info({ meetingId: created.meetingId, organizerId: actor.id }, "Meeting created");
    const result = await this.getById(String(created._id), actor);
    await hookMeetingCreated(
      {
        _id: created._id,
        id: String(created._id),
        meetingId: created.meetingId,
        title: created.title,
        startTime: created.startTime,
        timezone: created.timezone,
        organizerId: created.organizerId,
      },
      actor,
    );
    return result;
  },

  async update(id: string, input: UpdateMeetingInput, actor: Actor) {
    const meeting = await loadMeeting(id);
    const { employeeId, managedProjectIds } = await actorContext(actor);
    const current = asMeeting(meeting);

    const keys = Object.keys(input).filter((key) => input[key as keyof UpdateMeetingInput] !== undefined);
    const notesOnly = keys.length === 1 && keys[0] === "notes";
    if (notesOnly) {
      assertCanView(actor, current, employeeId, managedProjectIds);
    } else {
      assertCanManage(actor, current, managedProjectIds);
      if (CLOSED_STATUSES.includes(current.status)) {
        throw new ConflictError("Completed or cancelled meetings cannot be updated");
      }
    }

    const startTime = input.startTime ?? (meeting.startTime as Date);
    const endTime = input.endTime ?? (meeting.endTime as Date);
    if (input.startTime || input.endTime) {
      assertTimeRange(new Date(startTime), new Date(endTime));
    }
    const participants =
      input.participants !== undefined ? await assertActiveParticipants(input.participants) : current.participants;
    if (input.projectId !== undefined) {
      await assertUsableProject(input.projectId, actor, employeeId);
    }
    if (input.startTime || input.endTime || input.participants) {
      await assertNoConflicts(participants, new Date(startTime), new Date(endTime), id);
    }

    const updated = await meetingRepository.updateById(id, {
      ...input,
      participants: input.participants ? participants : undefined,
    });
    if (!updated) throw new NotFoundError("Meeting not found");
    return this.getById(id, actor);
  },

  async reschedule(id: string, input: { startTime: Date; endTime: Date; timezone?: string }, actor: Actor) {
    const meeting = await loadMeeting(id);
    const { managedProjectIds } = await actorContext(actor);
    const current = asMeeting(meeting);
    assertCanManage(actor, current, managedProjectIds);
    if (CLOSED_STATUSES.includes(current.status)) {
      throw new ConflictError("Completed or cancelled meetings cannot be rescheduled");
    }
    assertTimeRange(input.startTime, input.endTime);
    await assertNoConflicts(current.participants, input.startTime, input.endTime, id);

    const updated = await meetingRepository.updateById(id, {
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
    });
    if (!updated) throw new NotFoundError("Meeting not found");
    logger.info({ meetingId: updated.meetingId }, "Meeting rescheduled");
    return this.getById(id, actor);
  },

  async updateStatus(id: string, input: { status: MeetingStatus; notes?: string }, actor: Actor) {
    const meeting = await loadMeeting(id);
    const { managedProjectIds } = await actorContext(actor);
    assertCanManage(actor, asMeeting(meeting), managedProjectIds);

    const current = asMeeting(meeting).status;
    if (!ALLOWED_TRANSITIONS[current].includes(input.status)) {
      throw new ConflictError(`Cannot change status from ${current} to ${input.status}`);
    }

    const patch: Record<string, unknown> = { status: input.status };
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.status === "COMPLETED") patch.completedAt = new Date();
    if (input.status === "CANCELLED") patch.cancelledAt = new Date();

    const updated = await meetingRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Meeting not found");
    return this.getById(id, actor);
  },

  async cancel(id: string, reason: string, actor: Actor) {
    const meeting = await loadMeeting(id);
    const { managedProjectIds } = await actorContext(actor);
    assertCanManage(actor, asMeeting(meeting), managedProjectIds);
    if (CLOSED_STATUSES.includes(asMeeting(meeting).status)) {
      throw new ConflictError("Completed or cancelled meetings cannot be cancelled again");
    }

    const updated = await meetingRepository.updateById(id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: reason,
    });
    if (!updated) throw new NotFoundError("Meeting not found");
    logger.info({ meetingId: updated.meetingId }, "Meeting cancelled");
    await hookMeetingCancelled({
      _id: updated._id,
      id: String(updated._id),
      meetingId: updated.meetingId,
      title: updated.title,
      organizerId: updated.organizerId,
      participants: updated.participants,
    });
    return this.getById(id, actor);
  },

  async remove(id: string, actor: Actor) {
    assertCanDelete(actor);
    await loadMeeting(id);
    const updated = await meetingRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Meeting not found");
    return meetingRepository.toPublic(updated);
  },

  today(query: Record<string, unknown>, actor: Actor) {
    const now = query.now instanceof Date ? query.now : new Date();
    const { start, end } = getZonedDayRange(now, env.APP_TIMEZONE);
    return listMeetings({ ...query, sortBy: "startTime", sortOrder: "asc" }, actor, {
      overlapStart: start,
      overlapEnd: end,
    });
  },

  upcoming(query: Record<string, unknown>, actor: Actor) {
    const days = typeof query.days === "number" ? query.days : 7;
    const now = query.now instanceof Date ? query.now : new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return listMeetings(
      { ...query, sortBy: query.sortBy ?? "startTime", sortOrder: query.sortOrder ?? "asc" },
      actor,
      { startFrom: now, startToExclusive: until, excludeCancelled: true },
    );
  },

  async myMeetings(query: Record<string, unknown>, actor: Actor) {
    const { employeeId } = await actorContext(actor);
    const { page, limit, skip } = parsePagination(query);
    const parsed = parseListQuery(query);
    const clauses: Record<string, unknown>[] = [{ organizerId: actor.id }];
    if (employeeId) clauses.push({ participants: employeeId });

    const result = await meetingRepository.list({
      ...parsed,
      scope: { $or: clauses },
      skip,
      limit,
    });

    return {
      items: await hydrate(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async calendar(query: { from: Date; to: Date }, actor: Actor) {
    const { employeeId, managedProjectIds } = await actorContext(actor);
    const items = await meetingRepository.calendar({
      overlapStart: query.from,
      overlapEnd: query.to,
      scope: visibilityScope(actor, employeeId, managedProjectIds),
      sortBy: "startTime",
      sortOrder: "asc",
    });

    return items.map((item) => ({
      id: String(item._id),
      meetingId: item.meetingId,
      title: item.title,
      start: item.startTime,
      end: item.endTime,
      status: item.status,
      meetingType: item.meetingType,
      projectId: item.projectId ? String(item.projectId) : null,
    }));
  },

  async counts(actor: Actor) {
    const { employeeId, managedProjectIds } = await actorContext(actor);
    return meetingRepository.counts(visibilityScope(actor, employeeId, managedProjectIds));
  },

  async listForProject(projectId: string, query: Record<string, unknown>, actor: Actor) {
    assertObjectId(projectId);
    const project = await projectRepository.findById(projectId);
    if (!project || project.isDeleted) throw new NotFoundError("Project not found");
    const { employeeId } = await actorContext(actor);
    if (
      !canViewProject(
        actor,
        {
          managerId: String(project.managerId),
          members: (project.members ?? []).map((member) => String(member)),
        },
        employeeId,
      )
    ) {
      throw new ForbiddenError("You do not have permission to view this project");
    }

    return listMeetings({ ...query, projectId }, actor);
  },
};
