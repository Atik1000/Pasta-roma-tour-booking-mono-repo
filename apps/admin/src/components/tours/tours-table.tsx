'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  DataTable,
  FilterPanel,
  FilterRange,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  TableFooter,
  Thumbnail,
  type ColumnDef,
  useToast,
} from '@pasta/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatDuration, formatMoney } from '@pasta/utils';
import { Eye, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';

import type { AdminTour } from '@pasta/api-client';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { adminApi } from '@/lib/session';

export interface ToursTableProps {
  locations: string[];
}

/** The advanced filters behind the Filters button. */
interface Advanced {
  from: string;
  to: string;
  minPrice: string;
  maxPrice: string;
}

const NO_ADVANCED: Advanced = { from: '', to: '', minPrice: '', maxPrice: '' };

/** Major units as typed, to the minor units the API stores. */
function toMinor(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

export function ToursTable({ locations }: ToursTableProps) {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('ALL');
  const [location, setLocation] = React.useState('ALL');
  const [advanced, setAdvanced] = React.useState<Advanced>(NO_ADVANCED);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(10);

  // Typing fires one request when the operator stops, not one per keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);

  /** Any narrowing change belongs back on page 1 — page 3 of a new result set is usually empty. */
  function narrow(apply: () => void) {
    apply();
    setPage(1);
  }

  const activeAdvanced = Object.values(advanced).filter((entry) => entry !== '').length;

  // Filtering, sorting and paging all happen server-side, so a 24-tour
  // catalogue never ships in full to the browser.
  const query = useQuery({
    queryKey: ['admin', 'tours', { debouncedSearch, status, location, advanced, page, perPage }],
    queryFn: () =>
      adminApi.admin.tours({
        search: debouncedSearch.trim() || undefined,
        status,
        location: location === 'ALL' ? undefined : location,
        from: advanced.from || undefined,
        to: advanced.to || undefined,
        minPriceMinor: toMinor(advanced.minPrice),
        maxPriceMinor: toMinor(advanced.maxPrice),
        page,
        limit: perPage,
      }),
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  const toast = useToast();

  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = React.useState<AdminTour | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.admin.deleteTour(id),
    onSuccess: async () => {
      toast.success('Tour deleted', `${pendingDelete?.title ?? 'It'} is no longer listed.`);
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tours'] });
    },
  });

  const columns = React.useMemo<ColumnDef<AdminTour, unknown>[]>(
    () => [
      {
        id: 'tour',
        header: 'Tour',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Thumbnail
              src={row.original.coverImage}
              alt={row.original.title}
              className="h-12 w-20"
            />
            <span className="min-w-0">
              <span className="block font-medium">{row.original.title}</span>
              <span className="text-muted-foreground block max-w-xs truncate text-xs">
                {row.original.description}
              </span>
            </span>
          </div>
        ),
      },
      { id: 'location', header: 'Location', cell: ({ row }) => row.original.location },
      {
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => formatDuration(row.original.durationHours),
      },
      {
        id: 'price',
        header: 'Adult Price (USD)',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoney(row.original.priceUsdMinor, 'USD')}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'updated',
        header: 'Updated',
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap text-sm">
            {formatDateTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button variant="subtle" size="icon" asChild aria-label={`View ${row.original.title}`}>
              <Link href={`/tours/${row.original.id}`}>
                <Eye aria-hidden />
              </Link>
            </Button>
            <Button variant="subtle" size="icon" asChild aria-label={`Edit ${row.original.title}`}>
              <Link href={`/tours/${row.original.id}`}>
                <Pencil aria-hidden />
              </Link>
            </Button>
            <Button
              variant="subtle"
              size="icon"
              aria-label={`Delete ${row.original.title}`}
              className="border-danger/30 text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => setPendingDelete(row.original)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const hasFilters = search !== '' || status !== 'ALL' || location !== 'ALL' || activeAdvanced > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_13rem_13rem_auto_auto]">
          <div>
            <label htmlFor="tour-search" className="sr-only">
              Search tours
            </label>
            <Input
              id="tour-search"
              type="search"
              value={search}
              onChange={(event) => narrow(() => setSearch(event.target.value))}
              placeholder="Search tours by title or location..."
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tour-status" className="text-muted-foreground text-xs">
              Status
            </label>
            <Select value={status} onValueChange={(next) => narrow(() => setStatus(next))}>
              <SelectTrigger id="tour-status" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PUBLISHED">Published</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tour-location" className="text-muted-foreground text-xs">
              Location
            </label>
            <Select value={location} onValueChange={(next) => narrow(() => setLocation(next))}>
              <SelectTrigger id="tour-location" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Locations</SelectItem>
                {locations.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <FilterPanel
            activeCount={activeAdvanced}
            onClear={() => narrow(() => setAdvanced(NO_ADVANCED))}
          >
            <FilterRange legend="Last updated">
              <Input
                type="date"
                aria-label="Updated on or after"
                value={advanced.from}
                onChange={(event) =>
                  narrow(() => setAdvanced({ ...advanced, from: event.target.value }))
                }
              />
              <Input
                type="date"
                aria-label="Updated on or before"
                value={advanced.to}
                onChange={(event) =>
                  narrow(() => setAdvanced({ ...advanced, to: event.target.value }))
                }
              />
            </FilterRange>

            <FilterRange legend="Adult price (USD)">
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Min"
                aria-label="Lowest adult price"
                value={advanced.minPrice}
                onChange={(event) =>
                  narrow(() => setAdvanced({ ...advanced, minPrice: event.target.value }))
                }
              />
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Max"
                aria-label="Highest adult price"
                value={advanced.maxPrice}
                onChange={(event) =>
                  narrow(() => setAdvanced({ ...advanced, maxPrice: event.target.value }))
                }
              />
            </FilterRange>
          </FilterPanel>

          <Button
            variant="ghost"
            className="self-end"
            leadingIcon={<RotateCcw aria-hidden />}
            disabled={!hasFilters}
            onClick={() =>
              narrow(() => {
                setSearch('');
                setStatus('ALL');
                setLocation('ALL');
                setAdvanced(NO_ADVANCED);
              })
            }
          >
            Reset
          </Button>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={query.isLoading}
        emptyTitle="No tours match your filters"
        emptyDescription="Adjust the search or reset the filters to see every tour."
      />

      <TableFooter
        page={page}
        perPage={perPage}
        rowCount={rows.length}
        total={total}
        noun="tours"
        onPageChange={setPage}
        onPerPageChange={(next) => narrow(() => setPerPage(next))}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open: boolean) => !open && setPendingDelete(null)}
        title="Delete this tour?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be hidden from the website. Existing bookings for it are kept, so their history still resolves.`
            : null
        }
        confirmLabel="Delete tour"
        isPending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  );
}
