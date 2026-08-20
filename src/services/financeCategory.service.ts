import { logger } from "../config/logger";
import { financeCategoryRepository, type CategorySortField } from "../repositories/financeCategory.repository";
import { financeTransactionRepository } from "../repositories/financeTransaction.repository";
import type { FinanceCategoryStatus, FinanceCategoryType } from "../utils/constants";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextFinanceCategoryId } from "../utils/sequence";
import { type Actor, assertCanManageCategories } from "./finance.policy";
import { ID_RETRIES } from "./finance.context";

type CreateCategoryInput = {
  name: string;
  code: string;
  type: FinanceCategoryType;
  description?: string;
  status?: FinanceCategoryStatus;
};

async function loadCategory(id: string) {
  assertObjectId(id);
  const category = await financeCategoryRepository.findById(id);
  if (!category || category.isDeleted) throw new NotFoundError("Finance category not found");
  return financeCategoryRepository.toPublic(category);
}

export const financeCategoryService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    if (actor.role === "EMPLOYEE") {
      throw new ForbiddenError("You do not have permission to list finance categories");
    }
    const { page, limit, skip } = parsePagination(query);
    const result = await financeCategoryRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      type: query.type as FinanceCategoryType | undefined,
      status: query.status as FinanceCategoryStatus | undefined,
      skip,
      limit,
      sortBy: (query.sortBy as CategorySortField | undefined) ?? "name",
      sortOrder: query.sortOrder === "desc" ? "desc" : "asc",
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  async getById(id: string, actor: Actor) {
    if (actor.role === "EMPLOYEE") {
      throw new ForbiddenError("You do not have permission to view this category");
    }
    return loadCategory(id);
  },

  async create(input: CreateCategoryInput, actor: Actor) {
    assertCanManageCategories(actor);
    const existing = await financeCategoryRepository.findByCode(input.code);
    if (existing) {
      throw new ConflictError("Category code already exists", [{ field: "code", existingId: String(existing._id) }]);
    }
    let created = null;
    for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
      try {
        created = await financeCategoryRepository.create({
          categoryId: await nextFinanceCategoryId(),
          name: input.name,
          code: input.code,
          type: input.type,
          description: input.description ?? "",
          status: input.status ?? "ACTIVE",
          createdBy: actor.id,
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "categoryId") && attempt < ID_RETRIES - 1) continue;
        if (isDuplicateKey(error, "code")) throw new ConflictError("Category code already exists");
        throw error;
      }
    }
    if (!created) throw new ConflictError("Unable to generate a unique category ID");
    logger.info({ categoryId: created.categoryId, createdBy: actor.id }, "Finance category created");
    return this.getById(String(created._id), actor);
  },

  async update(
    id: string,
    input: { name?: string; description?: string; status?: FinanceCategoryStatus; type?: FinanceCategoryType },
    actor: Actor,
  ) {
    assertCanManageCategories(actor);
    const category = await loadCategory(id);
    if (input.type && input.type !== category.type) {
      const used = await financeTransactionRepository.countByCategoryId(id);
      if (used > 0) {
        throw new ConflictError("Category type cannot be changed after transactions exist");
      }
    }
    const updated = await financeCategoryRepository.updateById(id, input);
    if (!updated) throw new NotFoundError("Finance category not found");
    return financeCategoryRepository.toPublic(updated);
  },

  async remove(id: string, actor: Actor) {
    assertCanManageCategories(actor);
    await loadCategory(id);
    const updated = await financeCategoryRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
      status: "INACTIVE",
    });
    if (!updated) throw new NotFoundError("Finance category not found");
    return financeCategoryRepository.toPublic(updated);
  },
};
