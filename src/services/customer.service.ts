import { logger } from "../config/logger";
import { customerRepository, type CustomerSortField } from "../repositories/customer.repository";
import type { CustomerStatus } from "../utils/constants";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { normalizeCompanyName, normalizeEmail, normalizePhone } from "../utils/normalize";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextCustomerId } from "../utils/sequence";
import {
  type Actor,
  assertCanCreateCustomer,
  assertCanDeleteCrm,
  assertCanMutateAssigned,
  assertCanViewAssigned,
  visibilityFilter,
} from "./crm.policy";
import { ID_RETRIES, assertAssignableEmployee, hydrateAssignedRecords, resolveCrmScope } from "./crm.context";

type CreateCustomerInput = {
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  industry?: string;
  location?: string;
  address?: string;
  taxIdentifier?: string;
  assignedTo?: string | null;
  status?: CustomerStatus;
  notes?: string;
};

type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, "status">>;

function asAssigned(record: Record<string, unknown>) {
  return {
    assignedTo: record.assignedTo ? String(record.assignedTo) : null,
    createdBy: String(record.createdBy),
  };
}

function identityFields(input: { email?: string; phone?: string; companyName?: string }) {
  return {
    emailNormalized: normalizeEmail(input.email),
    phoneNormalized: normalizePhone(input.phone),
    companyNameNormalized: normalizeCompanyName(input.companyName),
  };
}

async function assertUniqueCustomer(
  input: { email?: string; phone?: string; companyName?: string },
  excludeId?: string,
) {
  const existing = await customerRepository.findDuplicate({
    emailNormalized: normalizeEmail(input.email) || undefined,
    phoneNormalized: normalizePhone(input.phone) || undefined,
    companyNameNormalized: normalizeCompanyName(input.companyName) || undefined,
    excludeId,
  });
  if (existing) {
    throw new ConflictError("A customer with this email, phone, or company already exists", [
      { existingId: String(existing._id ?? existing.id), customerId: existing.customerId },
    ]);
  }
}

async function loadCustomer(id: string) {
  assertObjectId(id);
  const customer = await customerRepository.findById(id);
  if (!customer || customer.isDeleted) throw new NotFoundError("Customer not found");
  return customerRepository.toPublic(customer);
}

export const customerService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const { teamIds } = await resolveCrmScope(actor);
    if (query.assignedTo && teamIds && !teamIds.includes(String(query.assignedTo))) {
      throw new ForbiddenError("You cannot filter another employee's customers");
    }

    const result = await customerRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      status: query.status as CustomerStatus | undefined,
      assignedTo: typeof query.assignedTo === "string" ? query.assignedTo : undefined,
      industry: typeof query.industry === "string" ? query.industry : undefined,
      location: typeof query.location === "string" ? query.location : undefined,
      scope: visibilityFilter(actor, teamIds),
      skip,
      limit,
      sortBy: (query.sortBy as CustomerSortField | undefined) ?? "createdAt",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
    });

    return {
      items: await hydrateAssignedRecords(result.items),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string, actor: Actor) {
    const customer = await loadCustomer(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanViewAssigned(actor, asAssigned(customer), teamIds);
    const [hydrated] = await hydrateAssignedRecords([customer], { includeCreator: true });
    return hydrated;
  },

  async create(input: CreateCustomerInput, actor: Actor) {
    assertCanCreateCustomer(actor);
    const { teamIds } = await resolveCrmScope(actor);
    if (input.assignedTo) await assertAssignableEmployee(actor, input.assignedTo, teamIds);
    await assertUniqueCustomer(input);

    let created = null;
    for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
      try {
        created = await customerRepository.create({
          customerId: await nextCustomerId(),
          name: input.name,
          companyName: input.companyName ?? "",
          email: input.email ?? "",
          phone: input.phone ?? "",
          alternatePhone: input.alternatePhone ?? "",
          industry: input.industry ?? "",
          location: input.location ?? "",
          address: input.address ?? "",
          taxIdentifier: (input.taxIdentifier ?? "").toUpperCase(),
          assignedTo: input.assignedTo ?? null,
          status: input.status ?? "ACTIVE",
          notes: input.notes ?? "",
          createdBy: actor.id,
          ...identityFields(input),
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "customerId") && attempt < ID_RETRIES - 1) continue;
        throw error;
      }
    }
    if (!created) throw new ConflictError("Unable to generate a unique customer ID");
    logger.info({ customerId: created.customerId, createdBy: actor.id }, "Customer created");
    return this.getById(String(created._id), actor);
  },

  async update(id: string, input: UpdateCustomerInput, actor: Actor) {
    const customer = await loadCustomer(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(customer), teamIds);
    if (input.assignedTo) await assertAssignableEmployee(actor, input.assignedTo, teamIds);
    if (input.email !== undefined || input.phone !== undefined || input.companyName !== undefined) {
      await assertUniqueCustomer(
        {
          email: input.email ?? (customer.email as string),
          phone: input.phone ?? (customer.phone as string),
          companyName: input.companyName ?? (customer.companyName as string),
        },
        id,
      );
    }

    const patch: Record<string, unknown> = { ...input };
    if (input.taxIdentifier !== undefined) patch.taxIdentifier = input.taxIdentifier.toUpperCase();
    if (input.email !== undefined || input.phone !== undefined || input.companyName !== undefined) {
      Object.assign(
        patch,
        identityFields({
          email: input.email ?? (customer.email as string),
          phone: input.phone ?? (customer.phone as string),
          companyName: input.companyName ?? (customer.companyName as string),
        }),
      );
    }

    const updated = await customerRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Customer not found");
    return this.getById(id, actor);
  },

  async updateStatus(id: string, status: CustomerStatus, actor: Actor) {
    const customer = await loadCustomer(id);
    const { teamIds } = await resolveCrmScope(actor);
    assertCanMutateAssigned(actor, asAssigned(customer), teamIds);
    const updated = await customerRepository.updateById(id, { status });
    if (!updated) throw new NotFoundError("Customer not found");
    return this.getById(id, actor);
  },

  async remove(id: string, actor: Actor) {
    assertCanDeleteCrm(actor);
    await loadCustomer(id);
    const updated = await customerRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Customer not found");
    return customerRepository.toPublic(updated);
  },
};
