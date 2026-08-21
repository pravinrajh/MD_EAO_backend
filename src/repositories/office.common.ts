import mongoose, { type FilterQuery } from "mongoose";

export function toObjectId(value: unknown) {
  if (typeof value === "string") return new mongoose.Types.ObjectId(value);
  return value;
}

export function stringifyOfficeIds(record: Record<string, unknown>, extra: string[] = []) {
  record.id = String(record._id ?? record.id);
  for (const key of ["createdBy", "deletedBy", "customerId", "projectId", "relatedId", "invoiceId", ...extra]) {
    if (record[key]) record[key] = String(record[key]);
  }
  delete record._id;
  delete record.__v;
  return record;
}

export function toPublicDoc<T extends { toJSON?: () => unknown }>(
  doc: T | Record<string, unknown>,
  extra: string[] = [],
) {
  const maybeJson = doc && typeof (doc as T).toJSON === "function" ? (doc as T).toJSON!.bind(doc) : null;
  if (maybeJson) {
    const record = maybeJson() as Record<string, unknown>;
    stringifyOfficeIds(record, extra);
    return record;
  }
  return stringifyOfficeIds({ ...(doc as Record<string, unknown>) }, extra);
}

export function createdByScope(scope: Record<string, unknown> | undefined): FilterQuery<Record<string, unknown>> {
  if (!scope?.createdBy) return {};
  return { createdBy: toObjectId(scope.createdBy) };
}
