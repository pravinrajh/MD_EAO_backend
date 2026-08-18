import type { Response } from "express";

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type SuccessArgs<T> = {
  res: Response;
  message: string;
  data?: T;
  meta?: PaginationMeta;
  statusCode?: number;
};

export function sendSuccess<T>({
  res,
  message,
  data,
  meta,
  statusCode = 200,
}: SuccessArgs<T>): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data: data ?? null,
    ...(meta ? { meta } : {}),
  });
}

type ErrorArgs = {
  res: Response;
  message: string;
  errors?: unknown[];
  statusCode?: number;
};

export function sendError({
  res,
  message,
  errors = [],
  statusCode = 500,
}: ErrorArgs): Response {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
}
