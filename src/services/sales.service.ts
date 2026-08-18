import { customerRepository } from "../repositories/customer.repository";
import { leadRepository } from "../repositories/lead.repository";
import { opportunityRepository } from "../repositories/opportunity.repository";
import { salesActivityRepository } from "../repositories/salesActivity.repository";
import { MY_SALES_LIMIT } from "../utils/constants";
import { ForbiddenError } from "../utils/errors";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { type Actor, visibilityFilter } from "./crm.policy";
import { hydrateAssignedRecords, resolveCrmScope } from "./crm.context";
import { opportunityService } from "./opportunity.service";

function followUpTo(query: Record<string, unknown>): Date {
  if (query.to instanceof Date) return query.to;
  return new Date();
}

export const salesService = {
  async summary(actor: Actor) {
    const { teamIds } = await resolveCrmScope(actor);
    const scope = visibilityFilter(actor, teamIds);
    const [leads, customers, opportunities, forecast] = await Promise.all([
      leadRepository.counts(scope),
      customerRepository.counts(scope),
      opportunityRepository.counts(scope),
      opportunityRepository.forecast(scope),
    ]);

    return {
      leads: {
        total: leads.total,
        new: leads.new,
        qualified: leads.qualified,
        converted: leads.converted,
        lost: leads.lost,
      },
      customers: {
        total: customers.total,
        active: customers.active,
      },
      opportunities: {
        total: opportunities.total,
        open: opportunities.open,
        won: opportunities.won,
        lost: opportunities.lost,
      },
      pipeline: {
        totalValue: forecast.pipelineValue,
        weightedValue: forecast.weightedPipelineValue,
      },
    };
  },

  async mySales(query: Record<string, unknown>, actor: Actor) {
    const { employeeId } = await resolveCrmScope(actor);
    if (!employeeId) {
      return {
        leads: { items: [], total: 0 },
        customers: { items: [], total: 0 },
        opportunities: { items: [], total: 0 },
        pendingActivities: { items: [], total: 0 },
      };
    }

    const { page, limit, skip } = parsePagination({
      ...query,
      limit: query.limit ?? MY_SALES_LIMIT,
    });
    const assignedScope = { assignedTo: employeeId };
    const activityScope = { employeeId };

    const [leads, customers, opportunities, activities] = await Promise.all([
      leadRepository.list({
        ...assignedScope,
        skip,
        limit,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
      customerRepository.list({
        ...assignedScope,
        skip,
        limit,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
      opportunityRepository.list({
        ...assignedScope,
        skip,
        limit,
        sortBy: "expectedCloseDate",
        sortOrder: "asc",
      }),
      salesActivityRepository.list({
        ...activityScope,
        status: "PENDING",
        skip,
        limit,
        sortBy: "scheduledAt",
        sortOrder: "asc",
      }),
    ]);

    const [leadItems, customerItems, opportunityItems, activityItems] = await Promise.all([
      hydrateAssignedRecords(leads.items),
      hydrateAssignedRecords(customers.items),
      hydrateAssignedRecords(opportunities.items),
      hydrateAssignedRecords(activities.items, { assignedField: "employeeId" }),
    ]);

    return {
      leads: { items: leadItems, total: leads.total, meta: buildPaginationMeta(page, limit, leads.total) },
      customers: {
        items: customerItems,
        total: customers.total,
        meta: buildPaginationMeta(page, limit, customers.total),
      },
      opportunities: {
        items: opportunityItems,
        total: opportunities.total,
        meta: buildPaginationMeta(page, limit, opportunities.total),
      },
      pendingActivities: {
        items: activityItems,
        total: activities.total,
        meta: buildPaginationMeta(page, limit, activities.total),
      },
    };
  },

  async followUps(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const { teamIds } = await resolveCrmScope(actor);
    if (query.assignedTo && teamIds && !teamIds.includes(String(query.assignedTo))) {
      throw new ForbiddenError("You cannot filter another employee's follow-ups");
    }

    const assignedTo = typeof query.assignedTo === "string" ? query.assignedTo : undefined;
    const from = query.from instanceof Date ? query.from : undefined;
    const to = followUpTo(query);
    const scope = visibilityFilter(actor, teamIds);

    const [leads, opportunities] = await Promise.all([
      leadRepository.list({
        assignedTo,
        followUpFrom: from,
        followUpTo: to,
        scope,
        skip,
        limit,
        sortBy: "nextFollowUpAt",
        sortOrder: "asc",
      }),
      opportunityRepository.list({
        assignedTo,
        followUpFrom: from,
        followUpTo: to,
        scope,
        skip,
        limit,
        sortBy: "nextFollowUpAt",
        sortOrder: "asc",
      }),
    ]);

    const [leadItems, opportunityItems] = await Promise.all([
      hydrateAssignedRecords(leads.items),
      hydrateAssignedRecords(opportunities.items),
    ]);

    return {
      leads: { items: leadItems, total: leads.total, meta: buildPaginationMeta(page, limit, leads.total) },
      opportunities: {
        items: opportunityItems,
        total: opportunities.total,
        meta: buildPaginationMeta(page, limit, opportunities.total),
      },
    };
  },

  calculatePipeline(actor: Actor) {
    return opportunityService.pipeline(actor);
  },

  async findOverdueFollowUps(actor: Actor, asOf = new Date()) {
    return this.followUps({ to: asOf }, actor);
  },

  async findHighValueOpportunities(actor: Actor, minEstimatedValue = 1_000_000) {
    const { teamIds } = await resolveCrmScope(actor);
    const result = await opportunityRepository.list({
      minEstimatedValue,
      scope: visibilityFilter(actor, teamIds),
      skip: 0,
      limit: MY_SALES_LIMIT,
      sortBy: "estimatedValue",
      sortOrder: "desc",
    });
    return hydrateAssignedRecords(result.items);
  },

  async findOpportunitiesClosingThisMonth(actor: Actor, now = new Date()) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const { teamIds } = await resolveCrmScope(actor);
    const result = await opportunityRepository.list({
      expectedCloseFrom: start,
      expectedCloseTo: end,
      scope: visibilityFilter(actor, teamIds),
      skip: 0,
      limit: MY_SALES_LIMIT,
      sortBy: "expectedCloseDate",
      sortOrder: "asc",
    });
    return hydrateAssignedRecords(result.items);
  },

  async findNewLeads(actor: Actor) {
    const { teamIds } = await resolveCrmScope(actor);
    const result = await leadRepository.list({
      status: "NEW",
      scope: visibilityFilter(actor, teamIds),
      skip: 0,
      limit: MY_SALES_LIMIT,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    return hydrateAssignedRecords(result.items);
  },

  async findInactiveCustomers(actor: Actor) {
    const { teamIds } = await resolveCrmScope(actor);
    const result = await customerRepository.list({
      status: "INACTIVE",
      scope: visibilityFilter(actor, teamIds),
      skip: 0,
      limit: MY_SALES_LIMIT,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    return hydrateAssignedRecords(result.items);
  },
};
