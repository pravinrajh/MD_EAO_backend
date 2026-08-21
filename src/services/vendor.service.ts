import { logger } from "../config/logger";
import { vendorRepository } from "../repositories/vendor.repository";
import type { VendorStatus } from "../utils/constants";
import { NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextVendorId } from "../utils/sequence";
import {
  type Actor,
  assertCanDeleteOffice,
  assertCanManageOffice,
  assertCanViewOffice,
  visibilityFilter,
} from "./office.policy";

type CreateVendorInput = {
  name: string;
  phone?: string;
  email?: string;
  location?: string;
  taxIdentifier?: string;
  status?: VendorStatus;
  notes?: string;
};

async function loadVendor(id: string, actor: Actor) {
  assertObjectId(id);
  const vendor = await vendorRepository.findById(id);
  if (!vendor || vendor.isDeleted) throw new NotFoundError("Vendor not found");
  const publicVendor = vendorRepository.toPublic(vendor);
  assertCanViewOffice(actor, { createdBy: String(publicVendor.createdBy) }, "this vendor");
  return publicVendor;
}

export const vendorService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const result = await vendorRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      status: query.status as VendorStatus | undefined,
      location: typeof query.location === "string" ? query.location : undefined,
      scope: visibilityFilter(actor),
      skip,
      limit,
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  getById(id: string, actor: Actor) {
    return loadVendor(id, actor);
  },

  async create(input: CreateVendorInput, actor: Actor) {
    assertCanManageOffice(actor, "vendors");
    const created = await vendorRepository.create({
      vendorId: await nextVendorId(),
      name: input.name,
      phone: input.phone ?? "",
      email: input.email ?? "",
      location: input.location ?? "",
      taxIdentifier: input.taxIdentifier ?? "",
      status: input.status ?? "ACTIVE",
      notes: input.notes ?? "",
      createdBy: actor.id,
    });
    logger.info({ vendorId: created.vendorId, createdBy: actor.id }, "Vendor created");
    return vendorRepository.toPublic(created);
  },

  async update(id: string, input: Partial<CreateVendorInput>, actor: Actor) {
    assertCanManageOffice(actor, "vendors");
    await loadVendor(id, actor);
    const patch: Record<string, unknown> = {};
    for (const key of ["name", "phone", "email", "location", "taxIdentifier", "status", "notes"] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    const updated = await vendorRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Vendor not found");
    return vendorRepository.toPublic(updated);
  },

  async remove(id: string, actor: Actor) {
    assertCanDeleteOffice(actor, "vendors");
    await loadVendor(id, actor);
    const updated = await vendorRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Vendor not found");
    return vendorRepository.toPublic(updated);
  },
};
