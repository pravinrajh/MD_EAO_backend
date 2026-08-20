import { logger } from "../config/logger";
import { accountRepository, type AccountSortField } from "../repositories/account.repository";
import type { AccountStatus, AccountType } from "../utils/constants";
import { DEFAULT_CURRENCY } from "../utils/constants";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextAccountId } from "../utils/sequence";
import { type Actor, assertCanManageAccounts, isPrivileged } from "./finance.policy";
import { ID_RETRIES } from "./finance.context";

type CreateAccountInput = {
  name: string;
  code: string;
  type: AccountType;
  description?: string;
  openingBalance?: number;
  currency?: string;
};

async function loadAccount(id: string) {
  assertObjectId(id);
  const account = await accountRepository.findById(id);
  if (!account || account.isDeleted) throw new NotFoundError("Account not found");
  return accountRepository.toPublic(account);
}

export const accountService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    if (actor.role === "EMPLOYEE") {
      throw new ForbiddenError("You do not have permission to list finance accounts");
    }
    const { page, limit, skip } = parsePagination(query);
    const result = await accountRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      type: query.type as AccountType | undefined,
      status: query.status as AccountStatus | undefined,
      skip,
      limit,
      sortBy: (query.sortBy as AccountSortField | undefined) ?? "name",
      sortOrder: query.sortOrder === "desc" ? "desc" : "asc",
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  async getById(id: string, actor: Actor) {
    if (actor.role === "EMPLOYEE") {
      throw new ForbiddenError("You do not have permission to view this account");
    }
    return loadAccount(id);
  },

  async create(input: CreateAccountInput, actor: Actor) {
    assertCanManageAccounts(actor);
    const existing = await accountRepository.findByCode(input.code);
    if (existing) {
      throw new ConflictError("Account code already exists", [{ field: "code", existingId: String(existing._id) }]);
    }
    const openingBalance = input.openingBalance ?? 0;
    let created = null;
    for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
      try {
        created = await accountRepository.create({
          accountId: await nextAccountId(),
          name: input.name,
          code: input.code,
          type: input.type,
          description: input.description ?? "",
          openingBalance,
          currentBalance: openingBalance,
          currency: input.currency ?? DEFAULT_CURRENCY,
          status: "ACTIVE",
          createdBy: actor.id,
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "accountId") && attempt < ID_RETRIES - 1) continue;
        if (isDuplicateKey(error, "code")) {
          throw new ConflictError("Account code already exists");
        }
        throw error;
      }
    }
    if (!created) throw new ConflictError("Unable to generate a unique account ID");
    logger.info({ accountId: created.accountId, createdBy: actor.id }, "Finance account created");
    return this.getById(String(created._id), actor);
  },

  async update(id: string, input: { name?: string; description?: string; status?: AccountStatus }, actor: Actor) {
    assertCanManageAccounts(actor);
    await loadAccount(id);
    const updated = await accountRepository.updateById(id, input);
    if (!updated) throw new NotFoundError("Account not found");
    return accountRepository.toPublic(updated);
  },

  async explainList(actor: Actor) {
    if (!isPrivileged(actor.role)) throw new ForbiddenError("You do not have permission to inspect queries");
    return accountRepository.explainList({ skip: 0, limit: 20, sortBy: "name", sortOrder: "asc" });
  },
};
