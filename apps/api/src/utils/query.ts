/**
 * query.ts — Shared helpers for pagination and sorted list responses.
 */

export interface PaginationOptions {
  page:  number;  // 1-indexed
  limit: number;  // max 100
  skip:  number;  // derived: (page-1)*limit
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
  };
}

/** Build a standard paginated response envelope. */
export function paginated<T>(
  data:  T[],
  total: number,
  opts:  PaginationOptions
): PaginatedResult<T> {
  return {
    data,
    meta: {
      total,
      page:       opts.page,
      limit:      opts.limit,
      totalPages: Math.ceil(total / opts.limit),
    },
  };
}
