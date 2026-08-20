import { logger } from "../config/logger";
import { budgetRepository, type BudgetSortField } from "../repositories/budget.repository";
import { financeCategoryRepository } from "../repositories/financeCategory.repository";
import { financeTransactionRepository } from "../repositories/financeTransaction.repository";
import type { BudgetStatus } from "../utils/constants";
import { DEFAULT_CURRENCY } from "../utils/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextBudgetId } from "../utils/sequence";
import { ID_RETRIES, assertProjectAccess, resolveFinanceScope } from "./finance.context";
import { type Actor, canManageCompanyBudgets, isPrivileged, visibilityFilter } from "./finance.policy";

type CreateBudgetInput = {
  name: string;
  projectId?: string | null;
  categoryId?: string | null;
  amount: number;
  currency?: string;
  periodStart: Date;
  periodEnd: Date;
  status?: BudgetStatus;
};

async function loadBudget(id: string) {
  assertObjectId(id);
  const budget = await budgetRepository.findById(id);
  if (!budget || budget.isDeleted) throw new NotFoundError("Budget not found");
  return budgetRepository.toPublic(budget);
}

async function assertCategory(id: string | null | undefined) {
  if (!id) return null;
  assertObjectId(id, "categoryId");
  const category = await financeCategoryRepository.findById(id);
  if (!category || category.isDeleted) {
    throw new BadRequestError("Category not found", [{ field: "categoryId", message: "Category must exist" }]);
  }
  return category;
}

async function assertCanAccessBudget(actor: Actor, budget: Record<string, unknown>, mode: "view" | "manage") {
  if (isPrivileged(actor.role)) return;
  const projectId = budget.projectId ? String(budget.projectId) : null;
  if (!projectId) {
    throw new ForbiddenError("You do not have permission to access company-wide budgets");
  }
  await assertProjectAccess(actor, projectId, mode === "manage" ? "manage" : "view");
}

export const budgetService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { projectIds } = await resolveFinanceScope(actor);
    if (query.projectId && projectIds && !projectIds.includes(String(query.projectId))) {
      throw new ForbiddenError("You cannot filter another project's budgets");
    }
    const { page, limit, skip } = parsePagination(query);
    const result = await budgetRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      projectId: typeof query.projectId === "string" ? query.projectId : undefined,
      categoryId: typeof query.categoryId === "string" ? query.categoryId : undefined,
      status: query.status as BudgetStatus | undefined,
      scope: visibilityFilter(actor, projectIds),
      skip,
      limit,
      sortBy: (query.sortBy as BudgetSortField | undefined) ?? "createdAt",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  async getById(id: string, actor: Actor) {
    const budget = await loadBudget(id);
    await assertCanAccessBudget(actor, budget, "view");
    return budget;
  },

  async create(input: CreateBudgetInput, actor: Actor) {
    if (input.projectId) {
      await assertProjectAccess(actor, input.projectId, actor.role === "EMPLOYEE" ? "view" : "manage");
      if (actor.role === "EMPLOYEE") {
        throw new ForbiddenError("You do not have permission to create budgets");
      }
    } else if (!canManageCompanyBudgets(actor.role)) {
      throw new ForbiddenError("Company-wide budgets require MD or ADMIN");
    }
    await assertCategory(input.categoryId);
    if (input.periodEnd.getTime() < input.periodStart.getTime()) {
      throw new BadRequestError("periodEnd must be on or after periodStart");
    }

    let created = null;
    for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
      try {
        created = await budgetRepository.create({
          budgetId: await nextBudgetId(),
          name: input.name,
          projectId: input.projectId ?? null,
          categoryId: input.categoryId ?? null,
          amount: input.amount,
          currency: input.currency ?? DEFAULT_CURRENCY,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: input.status ?? "ACTIVE",
          createdBy: actor.id,
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "budgetId") && attempt < ID_RETRIES - 1) continue;
        throw error;
      }
    }
    if (!created) throw new ConflictError("Unable to generate a unique budget ID");
    logger.info({ budgetId: created.budgetId, createdBy: actor.id }, "Budget created");
    return this.getById(String(created._id), actor);
  },

  async update(
    id: string,
    input: Partial<Omit<CreateBudgetInput, "currency">>,
    actor: Actor,
  ) {
    const budget = await loadBudget(id);
    await assertCanAccessBudget(actor, budget, "manage");
    if (budget.status !== "ACTIVE" && input.status === undefined) {
      throw new ConflictError("Closed or cancelled budgets cannot be updated");
    }
    if (input.projectId) await assertProjectAccess(actor, input.projectId, "manage");
    if (input.categoryId !== undefined) await assertCategory(input.categoryId);
    const periodStart = input.periodStart ?? (budget.periodStart as Date);
    const periodEnd = input.periodEnd ?? (budget.periodEnd as Date);
    if (new Date(periodEnd).getTime() < new Date(periodStart).getTime()) {
      throw new BadRequestError("periodEnd must be on or after periodStart");
    }
    const updated = await budgetRepository.updateById(id, input);
    if (!updated) throw new NotFoundError("Budget not found");
    return budgetRepository.toPublic(updated);
  },

  async summary(id: string, actor: Actor) {
    const budget = await loadBudget(id);
    await assertCanAccessBudget(actor, budget, "view");
    const match: Record<string, unknown> = {
      transactionDate: { $gte: budget.periodStart, $lte: budget.periodEnd },
    };
    if (budget.projectId) match.projectId = financeTransactionRepository.toObjectId(String(budget.projectId));
    if (budget.categoryId) match.categoryId = financeTransactionRepository.toObjectId(String(budget.categoryId));
    const actual = await financeTransactionRepository.expenseTotal(match);
    const amount = budget.amount as number;
    const remaining = amount - actual;
    const utilizationPercentage = amount === 0 ? (actual > 0 ? 100 : 0) : Math.floor((actual * 100) / amount);
    return {
      budget: amount,
      actual,
      remaining,
      utilizationPercentage,
      isOverBudget: actual > amount,
    };
  },

  async remove(id: string, actor: Actor) {
    const budget = await loadBudget(id);
    await assertCanAccessBudget(actor, budget, "manage");
    const updated = await budgetRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Budget not found");
    return budgetRepository.toPublic(updated);
  },
};
