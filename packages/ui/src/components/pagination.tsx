'use client';

import { buildPageRange } from '@pasta/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../lib/cn';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Number of pages shown either side of the current one. */
  siblings?: number;
  className?: string;
}

/**
 * The `1 2 3 … 19` pager used by every listing.
 * Page-number logic lives in `@pasta/utils` so it is unit-tested independently.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  siblings = 1,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageRange(page, totalPages, siblings);
  const base =
    'flex size-9 items-center justify-center rounded-field border border-border bg-card text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-center gap-2', className)}
    >
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={cn(
          base,
          'hover:border-primary hover:text-primary disabled:hover:border-border disabled:hover:text-foreground disabled:opacity-40',
        )}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>

      {pages.map((entry, index) =>
        entry === 'ellipsis' ? (
          <span
            key={`ellipsis-${index}`}
            aria-hidden
            className="text-muted-foreground flex size-9 items-center justify-center text-sm"
          >
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            aria-label={`Page ${entry}`}
            aria-current={entry === page ? 'page' : undefined}
            onClick={() => onPageChange(entry)}
            className={cn(
              base,
              entry === page
                ? 'bg-brand-gradient text-primary-foreground border-transparent font-medium'
                : 'hover:border-primary hover:text-primary',
            )}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={cn(
          base,
          'hover:border-primary hover:text-primary disabled:hover:border-border disabled:hover:text-foreground disabled:opacity-40',
        )}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  );
}
