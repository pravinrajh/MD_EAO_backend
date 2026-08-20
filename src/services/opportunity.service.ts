import { logger } from "../config/logger";
import { customerRepository } from "../repositories/customer.repository";
import { leadRepository } from "../repositories/lead.repository";
import { opportunityRepository, type OpportunitySortField } from "../repositories/opportunity.repository";
import { projectRepository } from "../repositories/project.repository";
import {
  OPPORTUNITY_STAGE_PROBABILITY,
  type OpportunityStage,
} from "../utils/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextOpportunityId } from "../utils/sequence";
import { canViewProject } from "./project.policy";
import {
  type Actor,
  assertCanCreateOpportunity,
  assertCanDeleteCrm,
  assertCanMutateAssigned,
  assertCanViewAssigned,
  visibilityFilter,
} from "./crm.policy";
import { ID_RETRIES, assertAssignableEmployee, hydrateAssignedRecords, resolveCrmScope } from "./crm.context";
import { hookCrmFollowUp } from "./reminder/hooks";

const ALLOWED_TRANSITIONS: Record<OpportunityStage, OpportunityStage[]> = {
  NEW: ["QUALIFICATION", "LOST"],
  QUALIFICATION: ["PROPOSAL", "LOST"],
  PROPOSAL: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

const CLOSED: OpportunityStage[] = ["WON", "LOST"];

type CreateOpportunityInput = {
  title: string;
  customerId: string;
  leadId?: string | null;
  projectId?: string | null;
  assignedTo?: string | null;
  stage?: OpportunityStage;
  probability?: number;
  estimatedValue?: number;
  expectedCloseDate?: Date;
  description?: string;
  nextFollowUpAt?: Date;
};

type UpdateOpportunityInput = Partial<Omit<CreateOpportunityInput, "stage">>;

function asAssigned(record: Record<string, unknown>) {
  return {
    assignedTo: record.assignedTo ? String(record.assignedTo) : null,
    createdBy: String(record.createdBy),
    stage: record.stage as OpportunityStage,
  };
}

async function assertActiveCustomer(customerId: string) {
  assertObjectId(customerId, "customerId");
  const customer = await customerRepository.findById(customerId);
  if (!customer || customer.isDeleted) {
    throw new BadRequestError("Customer not found", [{ field: "customerId", message: "Customer must exist" }]);
  }
  if (customer.status === "BLOCKED") {
    throw new ConflictError("Blocked customers cannot receive new opportunities");
  }
  return customer;
}

async function assertUsableLead(leadId: string | null | undefined) {
  if (!leadId) return null;
  assertObjectId(leadId, "leadId");
  const lead = await leadRepository.findById(leadId);
  if (!lead || lead.isDeleted) {
    throw new BadRequestError("Lead not found", [{ field: "leadId", message: "Lead must exist" }]);
  }
  return lead;
}

async function assertUsableProject(projectId: string | null | undefined, actor: Actor, employeeId: string | null) {
  if (!projectId) return null;
  assertObjectId(projectId, "projectId");
  const project = await projectRepository.findById(projectId);
  if (!project || project.isDeleted) {
    throw new BadRequestError("Project not found", [{ field: "projectId", message: "Project must exist" }]);
  }
  if (project.status === "CANCELLED") {
    throw new ConflictError("Cancelled projects cannot be linked to opportunities");
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
    throw new ForbiddenError("You cannot attach this project to an opportunity");
  }
  return project;
}

async function linkProjectCustomerIfEmpty(projectId: string | null | undefined, customerId: string) {
  if (!projectId) return;
  const project = await projectRepository.findById(projectId);
  if (!project || project.isDeleted || project.customerId) return;
  await projectRepository.updateById(projectId, { customerId });
}

async function loadOpportunity(id: string) {
  assertObjectId(id);
  const opportunity = await opportunityRepository.findById(id);
  if (!opportunity || opportunity.isDeleted) throw new NotFoundError("Opportunity not found");
  return opportunityRepository.toPublic(opportunity);
}

async function hydrateOpportunities(items: Record<string, unknown>[], includeCreator = false) {
  const customerIds = [...new Set(items.map((item) => String(item.customerId ?? "")).filter(Boolean))];
  const projectIds = [...new Set(items.map((item) => String(item.projectId ?? "")).filter(Boolean))];
  const [hydrated, customers, projects] = await Promise.all([
    hydrateAssignedRecords(items, { includeCreator }),
    customerRepository.findSummariesByIds(customerIds),
    projectRepository.findSummariesByIds(projectIds),
  ]);
  const customersById = new Map(customers.map((item) => [String(item._id), item]));
  const projectsById = new Map(projects.map((item) => [String(item._id), item]));

  return hydrated.map((item) => {
    const customer = customersById.get(String(item.customerId ?? ""));
    const project = item.projectId ? projectsById.get(String(item.projectId)) : null;
    return {
      ...item,
      customer: customer
        ? { id: String(customer._id), name: customer.name, customerId: customer.customerId }
        : null,
      project: project ? { id: String(project._id), name: project.name, projectId: project.projectId } : null,
    };
  });
}

export const opportunityService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const { teamIds } = await resolveCrmScope(actor);
    if (query.assignedTo && teamIds && !teamIds.includes(String(query.assignedTo))) {
      throw new ForbiddenError("You cannot filter another employee's opportunities");
    }

    const result = await opportunityRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      stage: query.stage as OpportunityStage | undefined,
      assignedTo: typeof query.assignedTo === "string" ? query.assignedTo : undefined,
      customerId: typeof query.customerId === "string" ? query.customerId : undefined,
      projectId: typeof query.projectId === "string" ? query.projectId : undefined,
      from: query.from instanceof Date ? query.from : undefined,
      to: query.to instanceof Date ? query.to : undefined,
      scope: visibilityFilter(actor, teamIds),
      skip,
      limit,
      sortBy: (query.sortBy as OpportunitySortField | undefined) ?? "createdAt",
      sortOrder: (query.sortOrder as "asc" | "desc" | undefined) ?? "desc",
    });

    return {
      items: await hydrateOpportunities(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string, actor: Actor) {
    const opportunity = await loadOpportunity(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanViewAssigned(actor, asAssigned(opportunity), teamIds);
    const [hydrated] = await hydrateOpportunities([opportunity], true);
    return hydrated;
  },

  async create(input: CreateOpportunityInput, actor: Actor) {
    assertCanCreateOpportunity(actor);
    const { teamIds, employeeId } = await resolveCrmScope(actor);
    await assertActiveCustomer(input.customerId);
    await assertUsableLead(input.leadId);
    await assertUsableProject(input.projectId, actor, employeeId);
    if (input.assignedTo) await assertAssignableEmployee(actor, input.assignedTo, teamIds);

    const stage = input.stage ?? "NEW";
    const probability = input.probability ?? OPPORTUNITY_STAGE_PROBABILITY[stage];

    let created = null;
    for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
      try {
        created = await opportunityRepository.create({
          opportunityId: await nextOpportunityId(),
          title: input.title,
          customerId: input.customerId,
          leadId: input.leadId ?? null,
          projectId: input.projectId ?? null,
          assignedTo: input.assignedTo ?? null,
          stage,
          probability,
          estimatedValue: input.estimatedValue ?? 0,
          expectedCloseDate: input.expectedCloseDate ?? null,
          description: input.description ?? "",
          nextFollowUpAt: input.nextFollowUpAt ?? null,
          createdBy: actor.id,
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "opportunityId") && attempt < ID_RETRIES - 1) continue;
        throw error;
      }
    }
    if (!created) throw new ConflictError("Unable to generate a unique opportunity ID");
    await linkProjectCustomerIfEmpty(input.projectId ?? null, input.customerId);
    logger.info({ opportunityId: created.opportunityId, createdBy: actor.id }, "Opportunity created");
    const result = await this.getById(String(created._id), actor);
    if (created.nextFollowUpAt) {
      await hookCrmFollowUp(
        {
          _id: created._id,
          assignedTo: created.assignedTo,
          nextFollowUpAt: created.nextFollowUpAt,
          title: created.title,
        },
        actor,
        "OPPORTUNITY",
      );
    }
    return result;
  },

  async update(id: string, input: UpdateOpportunityInput, actor: Actor) {
    const opportunity = await loadOpportunity(id);
    const { teamIds, employeeId } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(opportunity), teamIds);
    if (CLOSED.includes(asAssigned(opportunity).stage)) {
      throw new ConflictError("Won or lost opportunities cannot be updated");
    }
    if (input.customerId) await assertActiveCustomer(input.customerId);
    if (input.leadId !== undefined) await assertUsableLead(input.leadId);
    if (input.projectId !== undefined) await assertUsableProject(input.projectId, actor, employeeId);
    if (input.assignedTo) await assertAssignableEmployee(actor, input.assignedTo, teamIds);

    const updated = await opportunityRepository.updateById(id, input);
    if (!updated) throw new NotFoundError("Opportunity not found");
    const customerId = String(input.customerId ?? updated.customerId ?? "");
    const projectId =
      input.projectId === undefined ? (updated.projectId ? String(updated.projectId) : null) : input.projectId;
    if (customerId) await linkProjectCustomerIfEmpty(projectId, customerId);
    const result = await this.getById(id, actor);
    if (input.nextFollowUpAt) {
      await hookCrmFollowUp(
        {
          _id: updated._id,
          assignedTo: updated.assignedTo,
          nextFollowUpAt: updated.nextFollowUpAt,
          title: updated.title,
        },
        actor,
        "OPPORTUNITY",
      );
    }
    return result;
  },

  async updateStage(id: string, input: { stage: OpportunityStage; lostReason?: string }, actor: Actor) {
    const opportunity = await loadOpportunity(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(opportunity), teamIds);

    const current = asAssigned(opportunity).stage;
    if (!ALLOWED_TRANSITIONS[current].includes(input.stage)) {
      throw new ConflictError(`Cannot change opportunity stage from ${current} to ${input.stage}`);
    }

    const patch: Record<string, unknown> = { stage: input.stage };
    if (input.stage === "WON") {
      patch.probability = 100;
      patch.wonAt = new Date();
      patch.lostAt = null;
      patch.lostReason = "";
    }
    if (input.stage === "LOST") {
      patch.probability = 0;
      patch.lostAt = new Date();
      patch.lostReason = input.lostReason ?? "";
    }

    const updated = await opportunityRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Opportunity not found");
    return this.getById(id, actor);
  },

  async pipeline(actor: Actor) {
    const { teamIds } = await resolveCrmScope(actor);
    return opportunityRepository.pipeline(visibilityFilter(actor, teamIds));
  },

  async forecast(actor: Actor) {
    const { teamIds } = await resolveCrmScope(actor);
    return opportunityRepository.forecast(visibilityFilter(actor, teamIds));
  },

  async remove(id: string, actor: Actor) {
    assertCanDeleteCrm(actor);
    await loadOpportunity(id);
    const updated = await opportunityRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Opportunity not found");
    return opportunityRepository.toPublic(updated);
  },
};
