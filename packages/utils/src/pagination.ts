import type { PaginationMeta, PaginationQuery } from '@pasta/types';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export interface NormalizedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/** Clamps untrusted query input into safe Prisma `skip`/`take` values. */
export function normalizePagination(query: PaginationQuery = {}): NormalizedPagination {
  const page = Math.max(DEFAULT_PAGE, Math.floor(query.page ?? DEFAULT_PAGE) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
  );
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** `Showing 1–6 of 24 tours` — the counter shown above every listing. */
export function formatResultRange(meta: PaginationMeta, noun: string): string {
  if (meta.total === 0) return `No ${noun}`;
  const start = (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);
  return `Showing ${start}–${end} of ${meta.total} ${noun}`;
}

/**
 * Page numbers plus `'ellipsis'` markers, matching the `1 2 3 … 19` pagers
 * in the admin tables.
 */
export function buildPageRange(
  current: number,
  totalPages: number,
  siblings = 1,
): (number | 'ellipsis')[] {
  const totalNumbers = siblings * 2 + 5;
  if (totalPages <= totalNumbers) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, totalPages);
  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < totalPages - 1;

  const pages: (number | 'ellipsis')[] = [1];
  if (showLeftEllipsis) pages.push('ellipsis');
  for (let page = Math.max(2, left); page <= Math.min(totalPages - 1, right); page += 1) {
    pages.push(page);
  }
  if (showRightEllipsis) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}
