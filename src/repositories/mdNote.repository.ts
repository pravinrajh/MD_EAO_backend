import type { FilterQuery } from "mongoose";
import { MdNote, type MdNoteDocument } from "../models/MdNote";
import { MD_NOTE_SAFE_FIELDS, type MdNoteRelatedType } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";
import { createdByScope, stringifyOfficeIds, toObjectId, toPublicDoc } from "./office.common";

export type MdNoteListFilters = {
  search?: string;
  relatedType?: MdNoteRelatedType;
  relatedId?: string;
  scope?: Record<string, unknown>;
  skip: number;
  limit: number;
};

function buildFilter(filters: MdNoteListFilters): FilterQuery<MdNoteDocument> {
  const query: FilterQuery<MdNoteDocument> = { isDeleted: false };
  const and: FilterQuery<MdNoteDocument>[] = [];
  const scoped = createdByScope(filters.scope);
  if (Object.keys(scoped).length) and.push(scoped);
  if (filters.relatedType) query.relatedType = filters.relatedType;
  if (filters.relatedId) query.relatedId = toObjectId(filters.relatedId) as MdNoteDocument["relatedId"];
  if (filters.search) {
    const term = escapeRegex(filters.search);
    and.push({
      $or: [{ body: { $regex: term, $options: "i" } }, { noteId: { $regex: `^${term}`, $options: "i" } }],
    });
  }
  if (and.length) query.$and = and;
  return query;
}

export const mdNoteRepository = {
  create(data: Record<string, unknown>) {
    return MdNote.create(data);
  },
  findById(id: string) {
    return MdNote.findById(id).select(MD_NOTE_SAFE_FIELDS);
  },
  async list(filters: MdNoteListFilters) {
    const query = buildFilter(filters);
    const [items, total] = await Promise.all([
      MdNote.find(query).select(MD_NOTE_SAFE_FIELDS).sort({ createdAt: -1 }).skip(filters.skip).limit(filters.limit).lean(),
      MdNote.countDocuments(query),
    ]);
    return { items: items.map((item) => stringifyOfficeIds({ ...item })), total };
  },
  updateById(id: string, patch: Record<string, unknown>) {
    return MdNote.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(MD_NOTE_SAFE_FIELDS);
  },
  toPublic(doc: MdNoteDocument | Record<string, unknown>) {
    return toPublicDoc(doc);
  },
};
