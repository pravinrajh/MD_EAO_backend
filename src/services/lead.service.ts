import { logger } from "../config/logger";
import { customerRepository } from "../repositories/customer.repository";
import { leadRepository, type LeadSortField } from "../repositories/lead.repository";
import { opportunityRepository } from "../repositories/opportunity.repository";
import type { LeadPriority, LeadSource, LeadStatus, OpportunityStage } from "../utils/constants";
import { OPPORTUNITY_STAGE_PROBABILITY } from "../utils/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { normalizeCompanyName, normalizeEmail, normalizePhone } from "../utils/normalize";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextCustomerId, nextLeadId, nextOpportunityId } from "../utils/sequence";
import { withTransaction } from "../utils/transaction";
import {
  type Actor,
  assertCanDeleteCrm,
  assertCanMutateAssigned,
  assertCanViewAssigned,
  visibilityFilter,
} from "./crm.policy";
import {
  ID_RETRIES,
  assertAssignableEmployee,
  hydrateAssignedRecords,
  resolveCrmScope,
} from "./crm.context";
import { hookCrmFollowUp } from "./reminder/hooks";

const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["CONTACTED", "QUALIFIED", "UNQUALIFIED", "LOST"],
  CONTACTED: ["QUALIFIED", "UNQUALIFIED", "LOST"],
  QUALIFIED: ["CONVERTED", "LOST", "UNQUALIFIED"],
  UNQUALIFIED: ["CONTACTED", "QUALIFIED"],
  CONVERTED: [],
  LOST: [],
};

const CONVERTIBLE: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED"];

type CreateLeadInput = {
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  source: LeadSource;
  industry?: string;
  location?: string;
  description?: string;
  assignedTo?: string | null;
  priority: LeadPriority;
  estimatedValue?: number;
  expectedCloseDate?: Date;
  nextFollowUpAt?: Date;
};

type UpdateLeadInput = Partial<Omit<CreateLeadInput, "source" | "priority">> & {
  source?: LeadSource;
  priority?: LeadPriority;
};

type ConvertLeadInput = {
  createCustomer: boolean;
  createOpportunity: boolean;
  opportunity?: {
    title?: string;
    estimatedValue?: number;
    expectedCloseDate?: Date;
    description?: string;
    stage?: OpportunityStage;
    probability?: number;
  };
};

function asAssigned(record: Record<string, unknown>) {
  return {
    assignedTo: record.assignedTo ? String(record.assignedTo) : null,
    createdBy: String(record.createdBy),
    status: record.status as LeadStatus,
  };
}

function identityFields(input: { email?: string; phone?: string; companyName?: string }) {
  return {
    emailNormalized: normalizeEmail(input.email),
    phoneNormalized: normalizePhone(input.phone),
    companyNameNormalized: normalizeCompanyName(input.companyName),
  };
}

async function assertUniqueLead(
  input: { email?: string; phone?: string },
  excludeId?: string,
  session?: Parameters<typeof leadRepository.findDuplicate>[0]["session"],
) {
  const emailNormalized = normalizeEmail(input.email);
  const phoneNormalized = normalizePhone(input.phone);
  const existing = await leadRepository.findDuplicate({
    emailNormalized: emailNormalized || undefined,
    phoneNormalized: phoneNormalized || undefined,
    excludeId,
    session,
  });
  if (existing) {
    throw new ConflictError("A lead with this email or phone already exists", [
      { field: existing.emailNormalized ? "email" : "phone", existingId: String(existing._id ?? existing.id) },
    ]);
  }
}

async function loadLead(id: string) {
  assertObjectId(id);
  const lead = await leadRepository.findById(id);
  if (!lead || lead.isDeleted) throw new NotFoundError("Lead not found");
  return leadRepository.toPublic(lead);
}

async function createWithRetry(data: Record<string, unknown>, session?: Parameters<typeof nextLeadId>[0]) {
  for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
    try {
      return await leadRepository.create({ ...data, leadId: await nextLeadId(session) }, session);
    } catch (error) {
      if (isDuplicateKey(error, "leadId") && attempt < ID_RETRIES - 1) continue;
      throw error;
    }
  }
  throw new ConflictError("Unable to generate a unique lead ID");
}

export const leadService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const { teamIds } = await resolveCrmScope(actor);
    if (query.assignedTo && teamIds && !teamIds.includes(String(query.assignedTo))) {
      throw new ForbiddenError("You cannot filter another employee's leads");
    }

    const result = await leadRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      status: query.status as LeadStatus | undefined,
      priority: query.priority as LeadPriority | undefined,
      source: query.source as LeadSource | undefined,
      assignedTo: typeof query.assignedTo === "string" ? query.assignedTo : undefined,
      from: query.from instanceof Date ? query.from : undefined,
      to: query.to instanceof Date ? query.to : undefined,
      scope: visibilityFilter(actor, teamIds),
      skip,
      limit,
      sortBy: (query.sortBy as LeadSortField | undefined) ?? "createdAt",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
    });

    return {
      items: await hydrateAssignedRecords(result.items, { includeCreator: false }),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string, actor: Actor) {
    const lead = await loadLead(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanViewAssigned(actor, asAssigned(lead), teamIds);
    const [hydrated] = await hydrateAssignedRecords([lead], { includeCreator: true });
    return hydrated;
  },

  async create(input: CreateLeadInput, actor: Actor) {
    const { teamIds, employeeId } = await resolveCrmScope(actor);
    let assignedTo = input.assignedTo ?? null;
    if (!assignedTo && actor.role === "EMPLOYEE") assignedTo = employeeId;
    if (assignedTo) await assertAssignableEmployee(actor, assignedTo, teamIds);
    await assertUniqueLead(input);

    const created = await createWithRetry({
      name: input.name,
      companyName: input.companyName ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      alternatePhone: input.alternatePhone ?? "",
      source: input.source,
      industry: input.industry ?? "",
      location: input.location ?? "",
      description: input.description ?? "",
      assignedTo,
      status: "NEW",
      priority: input.priority,
      estimatedValue: input.estimatedValue ?? 0,
      expectedCloseDate: input.expectedCloseDate ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      createdBy: actor.id,
      ...identityFields(input),
    });

    logger.info({ leadId: created.leadId, createdBy: actor.id }, "Lead created");
    const result = await this.getById(String(created._id), actor);
    if (created.nextFollowUpAt) {
      await hookCrmFollowUp(
        {
          _id: created._id,
          assignedTo: created.assignedTo,
          nextFollowUpAt: created.nextFollowUpAt,
          name: created.name,
          companyName: created.companyName,
        },
        actor,
        "LEAD",
      );
    }
    return result;
  },

  async update(id: string, input: UpdateLeadInput, actor: Actor) {
    const lead = await loadLead(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(lead), teamIds);
    if (asAssigned(lead).status === "CONVERTED") {
      throw new ConflictError("Converted leads cannot be updated");
    }
    if (input.assignedTo) await assertAssignableEmployee(actor, input.assignedTo, teamIds);
    if (input.email !== undefined || input.phone !== undefined) {
      await assertUniqueLead(
        {
          email: input.email ?? (lead.email as string),
          phone: input.phone ?? (lead.phone as string),
        },
        id,
      );
    }

    const patch: Record<string, unknown> = { ...input };
    if (input.email !== undefined || input.phone !== undefined || input.companyName !== undefined) {
      Object.assign(
        patch,
        identityFields({
          email: input.email ?? (lead.email as string),
          phone: input.phone ?? (lead.phone as string),
          companyName: input.companyName ?? (lead.companyName as string),
        }),
      );
    }

    const updated = await leadRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Lead not found");
    const result = await this.getById(id, actor);
    if (input.nextFollowUpAt) {
      await hookCrmFollowUp(
        {
          _id: updated._id,
          assignedTo: updated.assignedTo,
          nextFollowUpAt: updated.nextFollowUpAt,
          name: updated.name,
          companyName: updated.companyName,
        },
        actor,
        "LEAD",
      );
    }
    return result;
  },

  async updateStatus(id: string, status: LeadStatus, actor: Actor) {
    if (status === "CONVERTED") {
      throw new ConflictError("Use POST /leads/:id/convert to convert a lead");
    }
    const lead = await loadLead(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(lead), teamIds);

    const current = asAssigned(lead).status;
    if (!ALLOWED_TRANSITIONS[current].includes(status)) {
      throw new ConflictError(`Cannot change lead status from ${current} to ${status}`);
    }

    const updated = await leadRepository.updateById(id, { status });
    if (!updated) throw new NotFoundError("Lead not found");
    return this.getById(id, actor);
  },

  async updateFollowUp(id: string, nextFollowUpAt: Date, actor: Actor) {
    const lead = await loadLead(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(lead), teamIds);
    if (["CONVERTED", "LOST", "UNQUALIFIED"].includes(asAssigned(lead).status)) {
      throw new ConflictError("Follow-up cannot be set on a closed lead");
    }
    const updated = await leadRepository.updateById(id, { nextFollowUpAt });
    if (!updated) throw new NotFoundError("Lead not found");
    const result = await this.getById(id, actor);
    await hookCrmFollowUp(
      {
        _id: updated._id,
        assignedTo: updated.assignedTo,
        nextFollowUpAt: updated.nextFollowUpAt,
        name: updated.name,
        companyName: updated.companyName,
      },
      actor,
      "LEAD",
    );
    return result;
  },

  async convert(id: string, input: ConvertLeadInput, actor: Actor) {
    const lead = await loadLead(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(lead), teamIds);

    if (lead.status === "CONVERTED") {
      return this.loadConversionResult(lead, actor);
    }
    if (!CONVERTIBLE.includes(asAssigned(lead).status)) {
      throw new ConflictError(`Cannot convert a lead in ${asAssigned(lead).status} status`);
    }

    const result = await withTransaction(async (session) => {
      const current = await leadRepository.findById(id, session);
      if (!current || current.isDeleted) throw new NotFoundError("Lead not found");
      if (current.status === "CONVERTED") {
        return { alreadyConverted: true as const, lead: leadRepository.toPublic(current) };
      }

      const existingCustomer = await customerRepository.findBySourceLeadId(id, session);
      let customerId = existingCustomer ? String(existingCustomer._id) : null;
      if (!customerId && input.createCustomer) {
        const emailNormalized = normalizeEmail(current.email);
        const phoneNormalized = normalizePhone(current.phone);
        const companyNameNormalized = normalizeCompanyName(current.companyName);
        const duplicate = await customerRepository.findDuplicate({
          emailNormalized: emailNormalized || undefined,
          phoneNormalized: phoneNormalized || undefined,
          companyNameNormalized: companyNameNormalized || undefined,
          session,
        });
        if (duplicate) {
          throw new ConflictError("A customer with this email, phone, or company already exists", [
            { existingId: String(duplicate._id), customerId: duplicate.customerId },
          ]);
        }

        let createdCustomer = null;
        for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
          try {
            createdCustomer = await customerRepository.create(
              {
                customerId: await nextCustomerId(session),
                name: current.companyName || current.name,
                companyName: current.companyName,
                email: current.email,
                phone: current.phone,
                alternatePhone: current.alternatePhone,
                industry: current.industry,
                location: current.location,
                assignedTo: current.assignedTo,
                sourceLeadId: current._id,
                status: "ACTIVE",
                createdBy: actor.id,
                emailNormalized,
                phoneNormalized,
                companyNameNormalized,
              },
              session,
            );
            break;
          } catch (error) {
            if (isDuplicateKey(error, "customerId") && attempt < ID_RETRIES - 1) continue;
            throw error;
          }
        }
        if (!createdCustomer) throw new ConflictError("Unable to generate a unique customer ID");
        customerId = String(createdCustomer._id);
      }

      const existingOpportunity = await opportunityRepository.findByLeadId(id, session);
      let opportunityId = existingOpportunity ? String(existingOpportunity._id) : null;
      if (!opportunityId && input.createOpportunity) {
        if (!customerId) {
          throw new BadRequestError("A customer is required to create an opportunity");
        }
        const stage = input.opportunity?.stage ?? "NEW";
        const probability = input.opportunity?.probability ?? OPPORTUNITY_STAGE_PROBABILITY[stage];
        let createdOpportunity = null;
        for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
          try {
            createdOpportunity = await opportunityRepository.create(
              {
                opportunityId: await nextOpportunityId(session),
                title: input.opportunity?.title || current.companyName || current.name,
                customerId,
                leadId: current._id,
                assignedTo: current.assignedTo,
                stage,
                probability,
                estimatedValue: input.opportunity?.estimatedValue ?? current.estimatedValue ?? 0,
                expectedCloseDate: input.opportunity?.expectedCloseDate ?? current.expectedCloseDate,
                description: input.opportunity?.description ?? current.description,
                createdBy: actor.id,
              },
              session,
            );
            break;
          } catch (error) {
            if (isDuplicateKey(error, "opportunityId") && attempt < ID_RETRIES - 1) continue;
            throw error;
          }
        }
        if (!createdOpportunity) throw new ConflictError("Unable to generate a unique opportunity ID");
        opportunityId = String(createdOpportunity._id);
      }

      const updated = await leadRepository.updateById(
        id,
        {
          status: "CONVERTED",
          convertedAt: new Date(),
          convertedCustomerId: customerId,
          convertedOpportunityId: opportunityId,
        },
        session,
      );
      if (!updated) throw new NotFoundError("Lead not found");
      return {
        alreadyConverted: false as const,
        lead: leadRepository.toPublic(updated),
      };
    });

    logger.info({ leadId: lead.leadId, createdBy: actor.id }, "Lead converted");
    return this.loadConversionResult(result.lead, actor);
  },

  async loadConversionResult(lead: Record<string, unknown>, actor: Actor) {
    const [hydratedLead] = await hydrateAssignedRecords(
      [typeof lead.id === "string" ? lead : leadRepository.toPublic(lead)],
      { includeCreator: true },
    );
    const customerId = hydratedLead.convertedCustomerId ? String(hydratedLead.convertedCustomerId) : null;
    const opportunityId = hydratedLead.convertedOpportunityId ? String(hydratedLead.convertedOpportunityId) : null;
    const [customer, opportunity] = await Promise.all([
      customerId ? customerRepository.findById(customerId) : Promise.resolve(null),
      opportunityId ? opportunityRepository.findById(opportunityId) : Promise.resolve(null),
    ]);
    return {
      lead: hydratedLead,
      customer: customer && !customer.isDeleted ? customerRepository.toPublic(customer) : null,
      opportunity: opportunity && !opportunity.isDeleted ? opportunityRepository.toPublic(opportunity) : null,
    };
  },

  async remove(id: string, actor: Actor) {
    assertCanDeleteCrm(actor);
    await loadLead(id);
    const updated = await leadRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Lead not found");
    return leadRepository.toPublic(updated);
  },

  async explainList(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const { teamIds } = await resolveCrmScope(actor);
    return leadRepository.explainList({
      scope: visibilityFilter(actor, teamIds),
      skip,
      limit,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  },
};
