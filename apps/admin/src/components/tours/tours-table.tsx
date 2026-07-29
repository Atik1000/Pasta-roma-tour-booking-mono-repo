'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  DataTable,
  Input,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  type ColumnDef,
} from '@pasta/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatDuration, formatMoney } from '@pasta/utils';
import { Eye, Filter, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';

import type { AdminTour } from '@pasta/api-client';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { adminApi } from '@/lib/session';

export interface ToursTableProps {
  locations: string[];
}

export function ToursTable({ locations }: ToursTableProps) {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('ALL');
  const [location, setLocation] = React.useState('ALL');
  const [page, setPage] = React.useState(1);
  const perPage = 10;

  // Filtering, sorting and paging all happen server-side, so a 24-tour
  // catalogue never ships in full to the browser.
  const query = useQuery({
    queryKey: ['admin', 'tours', { search, status, location, page }],
    queryFn: () =>
      adminApi.admin.tours({
        search: search.trim() || undefined,
        status,
        location: location === 'ALL' ? undefined : location,
        page,
        limit: perPage,
      }),
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = React.useState<AdminTour | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.admin.deleteTour(id),
    onSuccess: async () => {
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
            <span
              role="img"
              aria-label={row.original.title}
              className="rounded-field h-12 w-20 shrink-0 bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
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

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const hasFilters = search !== '' || status !== 'ALL' || location !== 'ALL';

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
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search tours by title or location..."
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tour-status" className="text-muted-foreground text-xs">
              Status
            </label>
            <Select
              value={status}
              onValueChange={(next) => {
                setStatus(next);
                setPage(1);
              }}
            >
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
            <Select
              value={location}
              onValueChange={(next) => {
                setLocation(next);
                setPage(1);
              }}
            >
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

          <Button variant="outline" className="self-end" leadingIcon={<Filter aria-hidden />}>
            Filters
          </Button>

          <Button
            variant="ghost"
            className="self-end"
            leadingIcon={<RotateCcw aria-hidden />}
            disabled={!hasFilters}
            onClick={() => {
              setSearch('');
              setStatus('ALL');
              setLocation('ALL');
              setPage(1);
            }}
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Showing {rows.length} of {total} tours
        </p>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

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
