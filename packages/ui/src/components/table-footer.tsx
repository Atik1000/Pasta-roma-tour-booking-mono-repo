'use client';

import { Pagination } from './pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { cn } from '../lib/cn';

/** The choices offered by the rows-per-page control. */
export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

export interface TableFooterProps {
  /** 1-based page currently shown. */
  page: number;
  /** Rows requested per page. */
  perPage: number;
  /** Rows actually returned for this page — the last page is usually short. */
  rowCount: number;
  /** Total matching rows across every page, from the server's pagination meta. */
  total: number;
  /** Plural noun for the range sentence: "tours", "bookings", "entries". */
  noun: string;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  className?: string;
}

/**
 * The footer every admin listing shares: a "Showing 1 to 10 of 152" range, the
 * pager, and the rows-per-page select.
 *
 * The range counts from the page offset rather than just reporting how many
 * rows came back, so page 3 of 152 reads "Showing 21 to 30 of 152" instead of
 * the meaningless "Showing 10 of 152".
 */
export function TableFooter({
  page,
  perPage,
  rowCount,
  total,
  noun,
  onPageChange,
  onPerPageChange,
  className,
}: TableFooterProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // An empty result set has no range to describe — "Showing 1 to 0" reads as a
  // bug, so it becomes a plain zero-state sentence.
  const first = rowCount === 0 ? 0 : (page - 1) * perPage + 1;
  const last = rowCount === 0 ? 0 : first + rowCount - 1;

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <p className="text-muted-foreground text-sm" role="status">
        {rowCount === 0 ? `No ${noun} to show` : `Showing ${first} to ${last} of ${total} ${noun}`}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />

        {onPerPageChange ? (
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            Rows per page
            <Select value={String(perPage)} onValueChange={(next) => onPerPageChange(Number(next))}>
              <SelectTrigger className="h-9 w-20" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROWS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
