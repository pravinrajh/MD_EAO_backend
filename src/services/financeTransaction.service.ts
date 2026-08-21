import { logger } from "../config/logger";
import { accountRepository } from "../repositories/account.repository";
import { customerRepository } from "../repositories/customer.repository";
import { financeCategoryRepository } from "../repositories/financeCategory.repository";
import {
  financeTransactionRepository,
  type TransactionSortField,
} from "../repositories/financeTransaction.repository";
import { opportunityRepository } from "../repositories/opportunity.repository";
import { projectRepository } from "../repositories/project.repository";
import {
  type FinanceTransactionStatus,
  type FinanceTransactionType,
  type PaymentMethod,
} from "../utils/constants";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextTransactionId } from "../utils/sequence";
import { withTransaction } from "../utils/transaction";
import { resolveCrmScope } from "./crm.context";
import { canViewAssigned } from "./crm.policy";
import { ID_RETRIES, assertProjectAccess, resolveFinanceScope } from "./finance.context";
import {
  type Actor,
  assertCanTransfer,
  canPostCompanyFinance,
  canPostProjectFinance,
  isPrivileged,
  visibilityFilter,
} from "./finance.policy";

const ALLOWED_STATUS: Record<FinanceTransactionStatus, FinanceTransactionStatus[]> = {
  PENDING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

type IncomeExpenseInput = {
  accountId: string;
  categoryId: string;
  amount: number;
  currency?: string;
  description?: string;
  projectId?: string | null;
  customerId?: string | null;
  opportunityId?: string | null;
  invoiceId?: string | null;
  transactionDate?: Date;
  paymentMethod?: PaymentMethod;
  externalReference?: string;
  notes?: string;
  status?: FinanceTransactionStatus;
};

type TransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency?: string;
  description?: string;
  transactionDate?: Date;
  notes?: string;
  status?: FinanceTransactionStatus;
};

async function existingByKey(key: string | undefined) {
  if (!key) return null;
  const found = await financeTransactionRepository.findByIdempotencyKey(key);
  return found && !found.isDeleted ? financeTransactionRepository.toPublic(found) : null;
}

async function assertActiveAccount(id: string, field: string) {
  assertObjectId(id, field);
  const account = await accountRepository.findById(id);
  if (!account || account.isDeleted) {
    throw new BadRequestError("Account not found", [{ field, message: "Account must exist" }]);
  }
  if (account.status !== "ACTIVE") {
    throw new ConflictError("Inactive accounts cannot receive transactions", [{ field }]);
  }
  return account;
}

async function assertCategory(id: string, expected: "INCOME" | "EXPENSE") {
  assertObjectId(id, "categoryId");
  const category = await financeCategoryRepository.findById(id);
  if (!category || category.isDeleted) {
    throw new BadRequestError("Category not found", [{ field: "categoryId", message: "Category must exist" }]);
  }
  if (category.status !== "ACTIVE") {
    throw new ConflictError("Inactive categories cannot be used for new transactions");
  }
  if (category.type !== expected) {
    throw new BadRequestError(`Category type must be ${expected}`, [
      { field: "categoryId", message: `Expected ${expected} category` },
    ]);
  }
  return category;
}

async function assertOptionalCustomer(id: string | null | undefined, actor: Actor) {
  if (!id) return null;
  assertObjectId(id, "customerId");
  const customer = await customerRepository.findById(id);
  if (!customer || customer.isDeleted) {
    throw new BadRequestError("Customer not found", [{ field: "customerId", message: "Customer must exist" }]);
  }
  if (isPrivileged(actor.role)) return customer;
  const { teamIds } = await resolveCrmScope(actor);
  if (
    !canViewAssigned(
      actor,
      { assignedTo: customer.assignedTo ? String(customer.assignedTo) : null, createdBy: String(customer.createdBy) },
      teamIds,
    )
  ) {
    throw new ForbiddenError("You do not have permission to post finance against this customer");
  }
  return customer;
}

async function assertOptionalOpportunity(id: string | null | undefined) {
  if (!id) return null;
  assertObjectId(id, "opportunityId");
  const opportunity = await opportunityRepository.findById(id);
  if (!opportunity || opportunity.isDeleted) {
    throw new BadRequestError("Opportunity not found", [{ field: "opportunityId", message: "Opportunity must exist" }]);
  }
  return opportunity;
}

async function assertCanPost(actor: Actor, projectId?: string | null) {
  if (projectId) {
    if (!canPostProjectFinance(actor.role)) {
      throw new ForbiddenError("You do not have permission to post project finance");
    }
    await assertProjectAccess(actor, projectId, actor.role === "MANAGER" ? "manage" : "view");
    return;
  }
  if (!canPostCompanyFinance(actor.role)) {
    throw new ForbiddenError("Company-wide finance posting requires MD or ADMIN");
  }
}

async function applyBalance(
  type: FinanceTransactionType,
  amount: number,
  accountId: string,
  counterpartyAccountId: string | null,
  session: Parameters<typeof accountRepository.adjustBalance>[2],
) {
  const applied: { id: string; delta: number }[] = [];
  const run = async (id: string, delta: number) => {
    const updated = await accountRepository.adjustBalance(id, delta, session);
    if (!updated) {
      throw new ConflictError(delta < 0 ? "Insufficient account balance" : "Account could not be updated");
    }
    applied.push({ id, delta });
    return updated;
  };

  try {
    if (type === "INCOME") await run(accountId, amount);
    if (type === "EXPENSE") await run(accountId, -amount);
    if (type === "TRANSFER" && counterpartyAccountId) {
      await run(accountId, -amount);
      await run(counterpartyAccountId, amount);
    }
  } catch (error) {
    if (!session) {
      for (const item of applied.reverse()) {
        await accountRepository.adjustBalance(item.id, -item.delta, null);
      }
    }
    throw error;
  }
}

async function incrementProjectExpense(projectId: string | null, amount: number, type: FinanceTransactionType, session: Parameters<typeof projectRepository.incrementActualExpense>[2]) {
  if (!projectId || type !== "EXPENSE") return;
  await projectRepository.incrementActualExpense(projectId, amount, session);
}

async function createRecord(data: Record<string, unknown>, session: Parameters<typeof nextTransactionId>[0]) {
  for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
    try {
      return await financeTransactionRepository.create({ ...data, transactionId: await nextTransactionId(session) }, session);
    } catch (error) {
      if (isDuplicateKey(error, "transactionId") && attempt < ID_RETRIES - 1) continue;
      throw error;
    }
  }
  throw new ConflictError("Unable to generate a unique transaction ID");
}

async function persistCompleted(input: {
  type: FinanceTransactionType;
  accountId: string;
  counterpartyAccountId?: string | null;
  amount: number;
  payload: Record<string, unknown>;
  projectId: string | null;
}) {
  return withTransaction(async (session) => {
    await applyBalance(input.type, input.amount, input.accountId, input.counterpartyAccountId ?? null, session);
    try {
      const created = await createRecord(input.payload, session);
      try {
        await incrementProjectExpense(input.projectId, input.amount, input.type, session);
      } catch (error) {
        if (!session) {
          await applyBalance(
            input.type,
            -input.amount,
            input.accountId,
            input.counterpartyAccountId ?? null,
            null,
          );
        }
        throw error;
      }
      return created;
    } catch (error) {
      if (!session) {
        await applyBalance(input.type, -input.amount, input.accountId, input.counterpartyAccountId ?? null, null);
      }
      throw error;
    }
  });
}

function referenceOf(input: {
  projectId?: string | null;
  customerId?: string | null;
  opportunityId?: string | null;
  invoiceId?: string | null;
  type?: string;
}) {
  if (input.type === "TRANSFER") return { referenceType: "TRANSFER", referenceId: "" };
  if (input.invoiceId) return { referenceType: "INVOICE", referenceId: String(input.invoiceId) };
  if (input.opportunityId) return { referenceType: "OPPORTUNITY", referenceId: String(input.opportunityId) };
  if (input.customerId) return { referenceType: "CUSTOMER", referenceId: String(input.customerId) };
  if (input.projectId) return { referenceType: "PROJECT", referenceId: String(input.projectId) };
  return { referenceType: "MANUAL", referenceId: "" };
}

async function hydrate(txns: Record<string, unknown>[]) {
  const accountIds = [
    ...new Set(
      txns.flatMap((item) => [String(item.accountId ?? ""), String(item.counterpartyAccountId ?? "")]).filter(Boolean),
    ),
  ];
  const categoryIds = [...new Set(txns.map((item) => String(item.categoryId ?? "")).filter(Boolean))];
  const projectIds = [...new Set(txns.map((item) => String(item.projectId ?? "")).filter(Boolean))];
  const customerIds = [...new Set(txns.map((item) => String(item.customerId ?? "")).filter(Boolean))];
  const opportunityIds = [...new Set(txns.map((item) => String(item.opportunityId ?? "")).filter(Boolean))];

  const [accounts, categories, projects, customers, opportunities] = await Promise.all([
    accountRepository.findSummariesByIds(accountIds),
    financeCategoryRepository.findSummariesByIds(categoryIds),
    projectRepository.findSummariesByIds(projectIds),
    customerRepository.findSummariesByIds(customerIds),
    opportunityRepository.findSummariesByIds(opportunityIds),
  ]);

  const accountsById = new Map(accounts.map((item) => [String(item._id), item]));
  const categoriesById = new Map(categories.map((item) => [String(item._id), item]));
  const projectsById = new Map(projects.map((item) => [String(item._id), item]));
  const customersById = new Map(customers.map((item) => [String(item._id), item]));
  const opportunitiesById = new Map(opportunities.map((item) => [String(item._id), item]));

  return txns.map((txn) => {
    const account = accountsById.get(String(txn.accountId ?? ""));
    const counterparty = txn.counterpartyAccountId ? accountsById.get(String(txn.counterpartyAccountId)) : null;
    const category = txn.categoryId ? categoriesById.get(String(txn.categoryId)) : null;
    const project = txn.projectId ? projectsById.get(String(txn.projectId)) : null;
    const customer = txn.customerId ? customersById.get(String(txn.customerId)) : null;
    const opportunity = txn.opportunityId ? opportunitiesById.get(String(txn.opportunityId)) : null;
    return {
      ...txn,
      account: account
        ? { id: String(account._id), name: account.name, accountId: account.accountId, currentBalance: account.currentBalance }
        : null,
      counterpartyAccount: counterparty
        ? { id: String(counterparty._id), name: counterparty.name, accountId: counterparty.accountId }
        : null,
      category: category ? { id: String(category._id), name: category.name, categoryId: category.categoryId, type: category.type } : null,
      project: project ? { id: String(project._id), name: project.name, projectId: project.projectId } : null,
      customer: customer ? { id: String(customer._id), name: customer.name, customerId: customer.customerId } : null,
      opportunity: opportunity
        ? { id: String(opportunity._id), title: opportunity.title, opportunityId: opportunity.opportunityId }
        : null,
    };
  });
}

async function loadPublic(id: string) {
  assertObjectId(id);
  const txn = await financeTransactionRepository.findById(id);
  if (!txn || txn.isDeleted) throw new NotFoundError("Transaction not found");
  return financeTransactionRepository.toPublic(txn);
}

export const financeTransactionService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { projectIds } = await resolveFinanceScope(actor);
    if (query.projectId && projectIds && !projectIds.includes(String(query.projectId))) {
      throw new ForbiddenError("You cannot filter another project's finance");
    }
    const { page, limit, skip } = parsePagination(query);
    const result = await financeTransactionRepository.list({
      type: query.type as FinanceTransactionType | undefined,
      status: query.status as FinanceTransactionStatus | undefined,
      accountId: typeof query.accountId === "string" ? query.accountId : undefined,
      categoryId: typeof query.categoryId === "string" ? query.categoryId : undefined,
      projectId: typeof query.projectId === "string" ? query.projectId : undefined,
      customerId: typeof query.customerId === "string" ? query.customerId : undefined,
      opportunityId: typeof query.opportunityId === "string" ? query.opportunityId : undefined,
      paymentMethod: query.paymentMethod as PaymentMethod | undefined,
      from: query.from instanceof Date ? query.from : undefined,
      to: query.to instanceof Date ? query.to : undefined,
      scope: visibilityFilter(actor, projectIds),
      skip,
      limit,
      sortBy: (query.sortBy as TransactionSortField | undefined) ?? "transactionDate",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
    });
    return {
      items: await hydrate(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string, actor: Actor) {
    const txn = await loadPublic(id);
    const { projectIds } = await resolveFinanceScope(actor);
    if (!isPrivileged(actor.role)) {
      const projectId = txn.projectId ? String(txn.projectId) : null;
      const allowed = txn.createdBy === actor.id || (projectId && projectIds?.includes(projectId));
      if (!allowed) throw new ForbiddenError("You do not have permission to view this transaction");
    }
    const [hydrated] = await hydrate([txn]);
    return hydrated;
  },

  async createIncome(input: IncomeExpenseInput, actor: Actor, idempotencyKey?: string) {
    const existing = await existingByKey(idempotencyKey);
    if (existing) return this.getById(String(existing.id), actor);

    await assertCanPost(actor, input.projectId);
    const account = await assertActiveAccount(input.accountId, "accountId");
    if (input.currency && input.currency !== account.currency) {
      throw new BadRequestError("Currency must match the account currency", [{ field: "currency" }]);
    }
    await assertCategory(input.categoryId, "INCOME");
    await assertOptionalCustomer(input.customerId, actor);
    await assertOptionalOpportunity(input.opportunityId);

    const status = input.status ?? "COMPLETED";
    const payload = {
      type: "INCOME",
      accountId: input.accountId,
      categoryId: input.categoryId,
      amount: input.amount,
      currency: account.currency,
      description: input.description ?? "",
      ...referenceOf(input),
      projectId: input.projectId ?? null,
      customerId: input.customerId ?? null,
      opportunityId: input.opportunityId ?? null,
      transactionDate: input.transactionDate ?? new Date(),
      status,
      paymentMethod: input.paymentMethod ?? "",
      externalReference: input.externalReference ?? "",
      idempotencyKey: idempotencyKey ?? "",
      notes: input.notes ?? "",
      createdBy: actor.id,
    };

    try {
      const created =
        status === "COMPLETED"
          ? await persistCompleted({
              type: "INCOME",
              accountId: input.accountId,
              amount: input.amount,
              payload,
              projectId: input.projectId ?? null,
            })
          : await createRecord(payload, null);
      logger.info({ transactionId: created.transactionId, createdBy: actor.id }, "Income recorded");
      return this.getById(String(created._id), actor);
    } catch (error) {
      if (isDuplicateKey(error, "idempotencyKey") && idempotencyKey) {
        const again = await existingByKey(idempotencyKey);
        if (again) return this.getById(String(again.id), actor);
      }
      throw error;
    }
  },

  async createExpense(input: IncomeExpenseInput, actor: Actor, idempotencyKey?: string) {
    const existing = await existingByKey(idempotencyKey);
    if (existing) return this.getById(String(existing.id), actor);

    await assertCanPost(actor, input.projectId);
    const account = await assertActiveAccount(input.accountId, "accountId");
    if (input.currency && input.currency !== account.currency) {
      throw new BadRequestError("Currency must match the account currency", [{ field: "currency" }]);
    }
    await assertCategory(input.categoryId, "EXPENSE");
    await assertOptionalCustomer(input.customerId, actor);
    await assertOptionalOpportunity(input.opportunityId);

    const status = input.status ?? "COMPLETED";
    const payload = {
      type: "EXPENSE",
      accountId: input.accountId,
      categoryId: input.categoryId,
      amount: input.amount,
      currency: account.currency,
      description: input.description ?? "",
      ...referenceOf(input),
      projectId: input.projectId ?? null,
      customerId: input.customerId ?? null,
      opportunityId: input.opportunityId ?? null,
      transactionDate: input.transactionDate ?? new Date(),
      status,
      paymentMethod: input.paymentMethod ?? "",
      externalReference: input.externalReference ?? "",
      idempotencyKey: idempotencyKey ?? "",
      notes: input.notes ?? "",
      createdBy: actor.id,
    };

    try {
      const created =
        status === "COMPLETED"
          ? await persistCompleted({
              type: "EXPENSE",
              accountId: input.accountId,
              amount: input.amount,
              payload,
              projectId: input.projectId ?? null,
            })
          : await createRecord(payload, null);
      logger.info({ transactionId: created.transactionId, createdBy: actor.id }, "Expense recorded");
      return this.getById(String(created._id), actor);
    } catch (error) {
      if (isDuplicateKey(error, "idempotencyKey") && idempotencyKey) {
        const again = await existingByKey(idempotencyKey);
        if (again) return this.getById(String(again.id), actor);
      }
      throw error;
    }
  },

  async createTransfer(input: TransferInput, actor: Actor, idempotencyKey?: string) {
    assertCanTransfer(actor);
    const existing = await existingByKey(idempotencyKey);
    if (existing) return this.getById(String(existing.id), actor);

    const source = await assertActiveAccount(input.fromAccountId, "fromAccountId");
    const destination = await assertActiveAccount(input.toAccountId, "toAccountId");
    if (String(source._id) === String(destination._id)) {
      throw new BadRequestError("Source and destination accounts must be different");
    }
    if (source.currency !== destination.currency) {
      throw new BadRequestError("Transfer accounts must use the same currency");
    }
    if (input.currency && input.currency !== source.currency) {
      throw new BadRequestError("Currency must match the account currency", [{ field: "currency" }]);
    }

    const status = input.status ?? "COMPLETED";
    const payload = {
      type: "TRANSFER",
      accountId: input.fromAccountId,
      counterpartyAccountId: input.toAccountId,
      categoryId: null,
      amount: input.amount,
      currency: source.currency,
      description: input.description ?? "",
      ...referenceOf({ type: "TRANSFER" }),
      transactionDate: input.transactionDate ?? new Date(),
      status,
      paymentMethod: "",
      idempotencyKey: idempotencyKey ?? "",
      notes: input.notes ?? "",
      createdBy: actor.id,
    };

    try {
      const created =
        status === "COMPLETED"
          ? await persistCompleted({
              type: "TRANSFER",
              accountId: input.fromAccountId,
              counterpartyAccountId: input.toAccountId,
              amount: input.amount,
              payload,
              projectId: null,
            })
          : await createRecord(payload, null);
      logger.info({ transactionId: created.transactionId, createdBy: actor.id }, "Transfer recorded");
      return this.getById(String(created._id), actor);
    } catch (error) {
      if (isDuplicateKey(error, "idempotencyKey") && idempotencyKey) {
        const again = await existingByKey(idempotencyKey);
        if (again) return this.getById(String(again.id), actor);
      }
      throw error;
    }
  },

  async updateStatus(id: string, status: FinanceTransactionStatus, actor: Actor) {
    const txn = await loadPublic(id);
    if (!isPrivileged(actor.role) && String(txn.createdBy) !== actor.id) {
      const { projectIds } = await resolveFinanceScope(actor);
      const projectId = txn.projectId ? String(txn.projectId) : null;
      if (!projectId || !projectIds?.includes(projectId)) {
        throw new ForbiddenError("You do not have permission to change this transaction");
      }
    }

    const current = txn.status as FinanceTransactionStatus;
    if (current === status) {
      const [hydrated] = await hydrate([txn]);
      return hydrated;
    }
    if (!ALLOWED_STATUS[current].includes(status)) {
      throw new ConflictError(`Cannot change transaction status from ${current} to ${status}`);
    }

    if (status === "CANCELLED") {
      const claimed = await financeTransactionRepository.claimPending(id, "CANCELLED");
      if (!claimed) {
        const latest = await loadPublic(id);
        if (latest.status === "CANCELLED") {
          const [hydrated] = await hydrate([latest]);
          return hydrated;
        }
        throw new ConflictError("Transaction status could not be updated");
      }
      return this.getById(id, actor);
    }

    const applied = await withTransaction(async (session) => {
      const claimed = await financeTransactionRepository.claimPending(id, "COMPLETED", session);
      if (!claimed) return null;
      try {
        await applyBalance(
          claimed.type as FinanceTransactionType,
          claimed.amount,
          String(claimed.accountId),
          claimed.counterpartyAccountId ? String(claimed.counterpartyAccountId) : null,
          session,
        );
        await incrementProjectExpense(
          claimed.projectId ? String(claimed.projectId) : null,
          claimed.amount,
          claimed.type as FinanceTransactionType,
          session,
        );
        return claimed;
      } catch (error) {
        if (!session) {
          await financeTransactionRepository.updateById(id, { status: "PENDING" });
        }
        throw error;
      }
    });

    if (!applied) {
      const latest = await loadPublic(id);
      if (latest.status === "COMPLETED") {
        const [hydrated] = await hydrate([latest]);
        return hydrated;
      }
      throw new ConflictError("Transaction status could not be updated");
    }
    return this.getById(id, actor);
  },
};
