/**
 * query.ts — Shared helpers for pagination, filtering, and sorting.
 * Every list endpoint uses parsePagination() so the behaviour is consistent.
 */

import { Request } from 'express';

export interface PaginationOptions {
  page: number;     // 1-indexed
  limit: number;    // items per page, max 100
  skip: number;     // derived: (page-1)*limit
}

export interface SortOptions {
  field: string;
  order: 1 | -1;   // 1 = asc, -1 = desc
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/** Parse ?page=&limit= from the request query string. */
export function parsePagination(req: Request): PaginationOptions {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? 1), 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20), 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

/** Parse ?sortBy=field&order=asc|desc from the request query string. */
export function parseSort(req: Request, defaultField = 'createdAt'): SortOptions {
  const field = String(req.query.sortBy ?? defaultField);
  const order = String(req.query.order ?? 'desc') === 'asc' ? 1 : -1;
  return { field, order };
}

/** Build a standard paginated response envelope. */
export function paginated<T>(
  data: T[],
  total: number,
  opts: PaginationOptions
): PaginatedResult<T> {
  return {
    data,
    meta: {
      total,
      page: opts.page,
      limit: opts.limit,
      totalPages: Math.ceil(total / opts.limit),
    },
  };
}
