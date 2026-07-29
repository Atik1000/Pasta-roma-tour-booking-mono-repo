'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { cn } from '../lib/cn';
import { EmptyState } from './states';
import { Skeleton } from './skeleton';

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  isLoading?: boolean;
  /** Number of skeleton rows drawn while loading. */
  loadingRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Server-side sorting: state lives with the caller, next to the query. */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  onRowClick?: (row: TData) => void;
  className?: string;
}

/**
 * The admin table.
 *
 * Sorting and pagination are server-driven — the caller owns the query state —
 * so a table of 152 bookings never ships 152 rows to the browser.
 */
export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  loadingRows = 8,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  sorting,
  onSortingChange,
  onRowClick,
  className,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    state: sorting ? { sorting } : undefined,
    manualSorting: true,
    manualPagination: true,
    onSortingChange: onSortingChange
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(sorting ?? []) : updater;
          onSortingChange(next);
        }
      : undefined,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={cn('rounded-card border-border bg-card overflow-hidden border', className)}>
      {/* Wide tables scroll inside their own container rather than the page. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-border border-b">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort() && Boolean(onSortingChange);
                  const direction = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        direction === 'asc'
                          ? 'ascending'
                          : direction === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      className="text-muted-foreground whitespace-nowrap px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="hover:text-foreground focus-visible:outline-ring inline-flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {direction === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : direction === 'desc' ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {isLoading
              ? Array.from({ length: loadingRows }, (_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className="border-border border-b last:border-0">
                    {columns.map((_, cellIndex) => (
                      <td key={cellIndex} className="px-5 py-4">
                        <Skeleton className="h-4 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'border-border border-b transition-colors last:border-0',
                      onRowClick && 'hover:bg-muted/50 cursor-pointer',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-5 py-4 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {!isLoading && data.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
    </div>
  );
}

export type { ColumnDef, SortingState };
