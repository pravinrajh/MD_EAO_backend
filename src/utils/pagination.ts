import { PAGINATION } from "./constants";
import type { PaginationMeta } from "./apiResponse";

export type { PaginationMeta };

type QueryLike = {
  page?: unknown;
  limit?: unknown;
};

export function parsePagination(query: QueryLike): {
  page: number;
  limit: number;
  skip: number;
} {
  const pageRaw = Number(query.page ?? PAGINATION.defaultPage);
  const limitRaw = Number(query.limit ?? PAGINATION.defaultLimit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : PAGINATION.defaultPage;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), PAGINATION.maxLimit)
      : PAGINATION.defaultLimit;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 50);
}
