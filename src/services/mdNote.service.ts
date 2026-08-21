import { logger } from "../config/logger";
import { mdNoteRepository } from "../repositories/mdNote.repository";
import type { MdNoteRelatedType } from "../utils/constants";
import { NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextMdNoteId } from "../utils/sequence";
import {
  type Actor,
  assertCanDeleteOffice,
  assertCanManageOffice,
  assertCanViewOffice,
  visibilityFilter,
} from "./office.policy";

type CreateMdNoteInput = {
  body: string;
  relatedType?: MdNoteRelatedType;
  relatedId?: string | null;
};

async function loadNote(id: string, actor: Actor) {
  assertObjectId(id);
  const note = await mdNoteRepository.findById(id);
  if (!note || note.isDeleted) throw new NotFoundError("Note not found");
  const publicNote = mdNoteRepository.toPublic(note);
  assertCanViewOffice(actor, { createdBy: String(publicNote.createdBy) }, "this note");
  return publicNote;
}

export const mdNoteService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const result = await mdNoteRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      relatedType: query.relatedType as MdNoteRelatedType | undefined,
      relatedId: typeof query.relatedId === "string" ? query.relatedId : undefined,
      scope: visibilityFilter(actor),
      skip,
      limit,
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  getById(id: string, actor: Actor) {
    return loadNote(id, actor);
  },

  async create(input: CreateMdNoteInput, actor: Actor) {
    assertCanManageOffice(actor, "MD notes");
    if (input.relatedId) assertObjectId(input.relatedId, "relatedId");
    const created = await mdNoteRepository.create({
      noteId: await nextMdNoteId(),
      body: input.body,
      relatedType: input.relatedType ?? "NONE",
      relatedId: input.relatedId ?? null,
      createdBy: actor.id,
    });
    logger.info({ noteId: created.noteId, createdBy: actor.id }, "MD note created");
    return mdNoteRepository.toPublic(created);
  },

  async update(id: string, input: Partial<CreateMdNoteInput>, actor: Actor) {
    assertCanManageOffice(actor, "MD notes");
    await loadNote(id, actor);
    const patch: Record<string, unknown> = {};
    if (input.body !== undefined) patch.body = input.body;
    if (input.relatedType !== undefined) patch.relatedType = input.relatedType;
    if (input.relatedId !== undefined) patch.relatedId = input.relatedId;
    const updated = await mdNoteRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Note not found");
    return mdNoteRepository.toPublic(updated);
  },

  async remove(id: string, actor: Actor) {
    assertCanDeleteOffice(actor, "MD notes");
    await loadNote(id, actor);
    const updated = await mdNoteRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Note not found");
    return mdNoteRepository.toPublic(updated);
  },
};
