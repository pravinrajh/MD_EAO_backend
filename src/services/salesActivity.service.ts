import { logger } from "../config/logger";
import { customerRepository } from "../repositories/customer.repository";
import { leadRepository } from "../repositories/lead.repository";
import { opportunityRepository } from "../repositories/opportunity.repository";
import { salesActivityRepository, type SalesActivitySortField } from "../repositories/salesActivity.repository";
import type { SalesActivityStatus, SalesActivityType } from "../utils/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextActivityId } from "../utils/sequence";
import {
  type Actor,
  activityVisibilityFilter,
  assertCanDeleteCrm,
  assertCanMutateAssigned,
  assertCanViewAssigned,
  canAccessAssignee,
} from "./crm.policy";
import { ID_RETRIES, assertAssignableEmployee, hydrateAssignedRecords, resolveCrmScope } from "./crm.context";

const ALLOWED_TRANSITIONS: Record<SalesActivityStatus, SalesActivityStatus[]> = {
  PENDING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

type CreateActivityInput = {
  type: SalesActivityType;
  title: string;
  description?: string;
  leadId?: string | null;
  customerId?: string | null;
  opportunityId?: string | null;
  employeeId?: string | null;
  scheduledAt?: Date;
  status?: SalesActivityStatus;
};

type UpdateActivityInput = Partial<Omit<CreateActivityInput, "status">>;

function asAssigned(record: Record<string, unknown>) {
  return {
    assignedTo: record.employeeId ? String(record.employeeId) : null,
    createdBy: String(record.createdBy),
    status: record.status as SalesActivityStatus,
  };
}

async function assertLinkedRecords(input: {
  leadId?: string | null;
  customerId?: string | null;
  opportunityId?: string | null;
}) {
  if (input.leadId) {
    assertObjectId(input.leadId, "leadId");
    const lead = await leadRepository.findById(input.leadId);
    if (!lead || lead.isDeleted) {
      throw new BadRequestError("Lead not found", [{ field: "leadId", message: "Lead must exist" }]);
    }
  }
  if (input.customerId) {
    assertObjectId(input.customerId, "customerId");
    const customer = await customerRepository.findById(input.customerId);
    if (!customer || customer.isDeleted) {
      throw new BadRequestError("Customer not found", [{ field: "customerId", message: "Customer must exist" }]);
    }
  }
  if (input.opportunityId) {
    assertObjectId(input.opportunityId, "opportunityId");
    const opportunity = await opportunityRepository.findById(input.opportunityId);
    if (!opportunity || opportunity.isDeleted) {
      throw new BadRequestError("Opportunity not found", [
        { field: "opportunityId", message: "Opportunity must exist" },
      ]);
    }
  }
}

async function loadActivity(id: string) {
  assertObjectId(id);
  const activity = await salesActivityRepository.findById(id);
  if (!activity || activity.isDeleted) throw new NotFoundError("Sales activity not found");
  return salesActivityRepository.toPublic(activity);
}

export const salesActivityService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const { teamIds } = await resolveCrmScope(actor);
    if (query.employeeId && teamIds && !teamIds.includes(String(query.employeeId))) {
      throw new ForbiddenError("You cannot filter another employee's activities");
    }

    const result = await salesActivityRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      leadId: typeof query.leadId === "string" ? query.leadId : undefined,
      customerId: typeof query.customerId === "string" ? query.customerId : undefined,
      opportunityId: typeof query.opportunityId === "string" ? query.opportunityId : undefined,
      employeeId: typeof query.employeeId === "string" ? query.employeeId : undefined,
      type: query.type as SalesActivityType | undefined,
      status: query.status as SalesActivityStatus | undefined,
      from: query.from instanceof Date ? query.from : undefined,
      to: query.to instanceof Date ? query.to : undefined,
      scope: activityVisibilityFilter(actor, teamIds),
      skip,
      limit,
      sortBy: (query.sortBy as SalesActivitySortField | undefined) ?? "createdAt",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
    });

    return {
      items: await hydrateAssignedRecords(result.items, { assignedField: "employeeId" }),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string, actor: Actor) {
    const activity = await loadActivity(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanViewAssigned(actor, asAssigned(activity), teamIds);
    const [hydrated] = await hydrateAssignedRecords([activity], { assignedField: "employeeId", includeCreator: true });
    return hydrated;
  },

  async create(input: CreateActivityInput, actor: Actor) {
    const { teamIds, employeeId } = await resolveCrmScope(actor);
    await assertLinkedRecords(input);

    let assignee = input.employeeId ?? employeeId;
    if (!assignee) {
      throw new BadRequestError("employeeId is required", [
        { field: "employeeId", message: "An active employee must own the activity" },
      ]);
    }
    if (input.employeeId) {
      await assertAssignableEmployee(actor, assignee, teamIds);
    } else if (teamIds && !canAccessAssignee(actor, assignee, teamIds)) {
      throw new ForbiddenError("You cannot create activities for this employee");
    } else {
      await assertAssignableEmployee(actor, assignee, teamIds);
    }

    let created = null;
    for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
      try {
        created = await salesActivityRepository.create({
          activityId: await nextActivityId(),
          type: input.type,
          title: input.title,
          description: input.description ?? "",
          leadId: input.leadId ?? null,
          customerId: input.customerId ?? null,
          opportunityId: input.opportunityId ?? null,
          employeeId: assignee,
          scheduledAt: input.scheduledAt ?? null,
          status: input.status ?? "PENDING",
          createdBy: actor.id,
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "activityId") && attempt < ID_RETRIES - 1) continue;
        throw error;
      }
    }
    if (!created) throw new ConflictError("Unable to generate a unique activity ID");
    logger.info({ activityId: created.activityId, createdBy: actor.id }, "Sales activity created");
    return this.getById(String(created._id), actor);
  },

  async update(id: string, input: UpdateActivityInput, actor: Actor) {
    const activity = await loadActivity(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(activity), teamIds);
    if (asAssigned(activity).status !== "PENDING") {
      throw new ConflictError("Completed or cancelled activities cannot be updated");
    }
    await assertLinkedRecords({
      leadId: input.leadId,
      customerId: input.customerId,
      opportunityId: input.opportunityId,
    });
    if (input.employeeId) await assertAssignableEmployee(actor, input.employeeId, teamIds);

    const updated = await salesActivityRepository.updateById(id, input);
    if (!updated) throw new NotFoundError("Sales activity not found");
    return this.getById(id, actor);
  },

  async updateStatus(id: string, status: SalesActivityStatus, actor: Actor) {
    const activity = await loadActivity(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(activity), teamIds);

    const current = asAssigned(activity).status;
    if (!ALLOWED_TRANSITIONS[current].includes(status)) {
      throw new ConflictError(`Cannot change activity status from ${current} to ${status}`);
    }

    const patch: Record<string, unknown> = { status };
    if (status === "COMPLETED") patch.completedAt = new Date();

    const updated = await salesActivityRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Sales activity not found");
    return this.getById(id, actor);
  },

  async remove(id: string, actor: Actor) {
    assertCanDeleteCrm(actor);
    await loadActivity(id);
    const updated = await salesActivityRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Sales activity not found");
    return salesActivityRepository.toPublic(updated);
  },
};
