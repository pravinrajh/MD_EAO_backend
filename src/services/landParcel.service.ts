import { logger } from "../config/logger";
import { landParcelRepository } from "../repositories/landParcel.repository";
import { projectRepository } from "../repositories/project.repository";
import type { LandParcelStatus } from "../utils/constants";
import { NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextLandParcelId } from "../utils/sequence";
import {
  type Actor,
  assertCanDeleteOffice,
  assertCanManageOffice,
  assertCanViewOffice,
  visibilityFilter,
} from "./office.policy";

type CreateLandParcelInput = {
  name: string;
  location?: string;
  areaNote?: string;
  ownerName?: string;
  askingPrice?: number;
  status?: LandParcelStatus;
  projectId?: string | null;
  notes?: string;
};

async function loadParcel(id: string, actor: Actor) {
  assertObjectId(id);
  const parcel = await landParcelRepository.findById(id);
  if (!parcel || parcel.isDeleted) throw new NotFoundError("Land parcel not found");
  const publicParcel = landParcelRepository.toPublic(parcel);
  assertCanViewOffice(actor, { createdBy: String(publicParcel.createdBy) }, "this land parcel");
  return publicParcel;
}

export const landParcelService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const result = await landParcelRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      status: query.status as LandParcelStatus | undefined,
      location: typeof query.location === "string" ? query.location : undefined,
      scope: visibilityFilter(actor),
      skip,
      limit,
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  getById(id: string, actor: Actor) {
    return loadParcel(id, actor);
  },

  async create(input: CreateLandParcelInput, actor: Actor) {
    assertCanManageOffice(actor, "land parcels");
    if (input.projectId) {
      assertObjectId(input.projectId, "projectId");
      const project = await projectRepository.findById(input.projectId);
      if (!project || project.isDeleted) throw new NotFoundError("Project not found");
    }
    const created = await landParcelRepository.create({
      parcelId: await nextLandParcelId(),
      name: input.name,
      location: input.location ?? "",
      areaNote: input.areaNote ?? "",
      ownerName: input.ownerName ?? "",
      askingPrice: input.askingPrice ?? 0,
      status: input.status ?? "AVAILABLE",
      projectId: input.projectId ?? null,
      notes: input.notes ?? "",
      createdBy: actor.id,
    });
    logger.info({ parcelId: created.parcelId, createdBy: actor.id }, "Land parcel created");
    return landParcelRepository.toPublic(created);
  },

  async update(id: string, input: Partial<CreateLandParcelInput>, actor: Actor) {
    assertCanManageOffice(actor, "land parcels");
    await loadParcel(id, actor);
    const patch: Record<string, unknown> = {};
    for (const key of ["name", "location", "areaNote", "ownerName", "askingPrice", "status", "notes", "projectId"] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    const updated = await landParcelRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Land parcel not found");
    return landParcelRepository.toPublic(updated);
  },

  async remove(id: string, actor: Actor) {
    assertCanDeleteOffice(actor, "land parcels");
    await loadParcel(id, actor);
    const updated = await landParcelRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Land parcel not found");
    return landParcelRepository.toPublic(updated);
  },
};
