import { customerRepository } from "../repositories/customer.repository";
import { financeTransactionRepository } from "../repositories/financeTransaction.repository";
import { env } from "../config/env";
import { ForbiddenError, NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { resolveCrmScope } from "./crm.context";
import { canViewAssigned } from "./crm.policy";
import { assertProjectAccess } from "./finance.context";
import { type Actor, assertCanViewCompanyFinance, isPrivileged } from "./finance.policy";
function dateMatch(from?: Date, to?: Date) {
  if (!from && !to) return {};
  const range: Record<string, Date> = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return { transactionDate: range };
}

function toId(value: unknown) {
  return financeTransactionRepository.toObjectId(value);
}

export const financeReportService = {
  async summary(query: Record<string, unknown>, actor: Actor) {
    const projectId = typeof query.projectId === "string" ? query.projectId : undefined;
    const accountId = typeof query.accountId === "string" ? query.accountId : undefined;
    if (projectId) {
      await assertProjectAccess(actor, projectId, "view");
    } else {
      assertCanViewCompanyFinance(actor);
    }

    const match: Record<string, unknown> = {
      ...dateMatch(query.from instanceof Date ? query.from : undefined, query.to instanceof Date ? query.to : undefined),
    };
    const and: Record<string, unknown>[] = [];
    if (projectId) and.push({ projectId: toId(projectId) });
    if (accountId) {
      and.push({ $or: [{ accountId: toId(accountId) }, { counterpartyAccountId: toId(accountId) }] });
    }
    if (and.length === 1) Object.assign(match, and[0]);
    else if (and.length > 1) match.$and = and;
    return financeTransactionRepository.summarize(match);
  },

  async monthly(query: Record<string, unknown>, actor: Actor) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: env.APP_TIMEZONE, year: "numeric" });
    const currentYear = Number(formatter.format(now));
    const year = typeof query.year === "number" ? query.year : currentYear;
    const projectId = typeof query.projectId === "string" ? query.projectId : undefined;
    if (projectId) await assertProjectAccess(actor, projectId, "view");
    else if (!isPrivileged(actor.role)) assertCanViewCompanyFinance(actor);

    const match: Record<string, unknown> = {};
    if (projectId) match.projectId = toId(projectId);
    return financeTransactionRepository.monthly(year, match);
  },

  async expensesByCategory(query: Record<string, unknown>, actor: Actor) {
    const projectId = typeof query.projectId === "string" ? query.projectId : undefined;
    if (projectId) await assertProjectAccess(actor, projectId, "view");
    else if (!isPrivileged(actor.role)) assertCanViewCompanyFinance(actor);

    const match: Record<string, unknown> = {
      ...dateMatch(query.from instanceof Date ? query.from : undefined, query.to instanceof Date ? query.to : undefined),
    };
    if (projectId) match.projectId = toId(projectId);
    return financeTransactionRepository.expensesByCategory(match);
  },

  async projectSummary(projectId: string, actor: Actor) {
    assertObjectId(projectId);
    const project = await assertProjectAccess(actor, projectId, "view", "notFound");
    const totals = await financeTransactionRepository.summarize({ projectId: toId(projectId) });
    const remainingBudget = project.budget - totals.expense;
    return {
      projectId: project.projectId,
      budget: project.budget,
      income: totals.income,
      expense: totals.expense,
      net: totals.net,
      remainingBudget,
    };
  },

  async customerSummary(customerId: string, actor: Actor) {
    assertObjectId(customerId);
    const customer = await customerRepository.findById(customerId);
    if (!customer || customer.isDeleted) throw new NotFoundError("Customer not found");
    if (!isPrivileged(actor.role)) {
      const { teamIds } = await resolveCrmScope(actor);
      const allowed = canViewAssigned(
        actor,
        {
          assignedTo: customer.assignedTo ? String(customer.assignedTo) : null,
          createdBy: String(customer.createdBy),
        },
        teamIds,
      );
      if (!allowed) throw new ForbiddenError("You do not have permission to view this customer finance");
    }
    const totals = await financeTransactionRepository.summarize({ customerId: toId(customerId) });
    return {
      customerId: customer.customerId,
      income: totals.income,
      expense: totals.expense,
    };
  },
};
