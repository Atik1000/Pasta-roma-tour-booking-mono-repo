'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  Combobox,
  DataTable,
  FilterPanel,
  FilterRange,
  Input,
  StatusPill,
  TableFooter,
  type ColumnDef,
  type ComboboxOption,
  useToast,
} from '@pasta/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatMoney } from '@pasta/utils';
import { Eye, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';

import type { AdminLocation, AdminTour } from '@pasta/api-client';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { countryFlag } from '@/lib/countries';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { adminApi } from '@/lib/session';

export interface ToursTableProps {
  /** Every destination, with its country — the two location filters are built from this. */
  locations: AdminLocation[];
}

const ALL = 'ALL';

/** The advanced filters behind the Filters button. */
interface Advanced {
  from: string;
  to: string;
  minPrice: string;
  maxPrice: string;
}

const NO_ADVANCED: Advanced = { from: '', to: '', minPrice: '', maxPrice: '' };

/**
 * The city half of a location name.
 *
 * Locations are stored the way an operator types them — "Naples, Italy" — so a
 * cell that prints the country above the location would say Italy twice. The
 * suffix comes off for display only; the stored name is untouched, and a name
 * that does not carry its country is returned as-is.
 */
function cityOf(location: string, country: string): string {
  const suffix = `, ${country}`;
  return location.endsWith(suffix) ? location.slice(0, -suffix.length) : location;
}

/** Major units as typed, to the minor units the API stores. */
function toMinor(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

export function ToursTable({ locations }: ToursTableProps) {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState(ALL);
  const [country, setCountry] = React.useState(ALL);
  const [location, setLocation] = React.useState(ALL);
  const [advanced, setAdvanced] = React.useState<Advanced>(NO_ADVANCED);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(10);

  const statusOptions = React.useMemo<ComboboxOption[]>(
    () => [
      { value: ALL, label: 'All statuses' },
      { value: 'PUBLISHED', label: 'Published' },
      { value: 'DRAFT', label: 'Draft' },
    ],
    [],
  );

  // Only countries that actually have a destination — the picker on the Add
  // Location dialog lists all 250, but filtering by one with no tours would
  // only ever produce an empty table.
  const countryOptions = React.useMemo<ComboboxOption[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of locations) {
      counts.set(entry.country, (counts.get(entry.country) ?? 0) + 1);
    }

    return [
      { value: ALL, label: 'All countries' },
      ...[...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => ({
          value: name,
          label: name,
          prefix: countryFlag(name),
          hint: `${count} ${count === 1 ? 'destination' : 'destinations'}`,
        })),
    ];
  }, [locations]);

  const locationOptions = React.useMemo<ComboboxOption[]>(
    () => [
      { value: ALL, label: 'All locations' },
      ...locations
        .filter((entry) => country === ALL || entry.country === country)
        .map((entry) => ({
          value: entry.name,
          // "Naples, Italy" earns its country while the list spans the world;
          // under a chosen country it is just noise on every row.
          label: country === ALL ? entry.name : cityOf(entry.name, entry.country),
          keywords: entry.country,
        })),
    ],
    [locations, country],
  );

  /**
   * Switching country strands a location from the old one, which would ask the
   * API for an impossible pair and always return nothing.
   */
  function chooseCountry(next: string) {
    setCountry(next);
    const stillValid =
      location === ALL ||
      next === ALL ||
      locations.some((entry) => entry.name === location && entry.country === next);
    if (!stillValid) setLocation(ALL);
  }

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
    queryKey: [
      'admin',
      'tours',
      { debouncedSearch, status, country, location, advanced, page, perPage },
    ],
    queryFn: () =>
      adminApi.admin.tours({
        search: debouncedSearch.trim() || undefined,
        status,
        country: country === ALL ? undefined : country,
        location: location === ALL ? undefined : location,
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
        // No thumbnail: the cover photo belongs to the tour page, and a column
        // of tiny crops told an operator scanning this list nothing the title
        // did not already say.
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block font-medium">{row.original.title}</span>
            <span className="text-muted-foreground block max-w-md truncate text-xs">
              {row.original.description}
            </span>
          </span>
        ),
      },
      {
        id: 'destination',
        header: 'Destination',
        cell: ({ row }) => (
          <div className="min-w-0 leading-tight">
            <span className="flex items-center gap-1.5 font-medium">
              <span aria-hidden>{countryFlag(row.original.country)}</span>
              <span className="truncate">{row.original.country}</span>
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {cityOf(row.original.location, row.original.country)}
            </span>
          </div>
        ),
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
        // A tour with no departure ahead of it cannot be booked whatever the
        // pill says, and that is invisible from the tour record alone — so the
        // row carries the warning rather than leaving it to be discovered on
        // the public site.
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <StatusPill status={row.original.status} />
            {row.original.upcomingDepartures === 0 ? (
              <Link
                href={`/tours/${row.original.id}`}
                className="text-warning-foreground bg-warning-soft whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
              >
                No departures
              </Link>
            ) : null}
          </div>
        ),
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

  const hasFilters =
    search !== '' || status !== ALL || country !== ALL || location !== ALL || activeAdvanced > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        {/*
          Every control carries a visible label of the same size and every one is
          h-11, so `items-end` lands the whole row on one baseline. The old bar
          hid the search label and shrank the selects to h-10, which left the
          search box floating a label's height above its neighbours.
        */}
        <CardContent className="grid items-end gap-x-3 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_10rem_12rem_12rem_auto_auto]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tour-search" className="text-muted-foreground text-xs font-medium">
              Search
            </label>
            <Input
              id="tour-search"
              type="search"
              value={search}
              onChange={(event) => narrow(() => setSearch(event.target.value))}
              placeholder="Title or location…"
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tour-status" className="text-muted-foreground text-xs font-medium">
              Status
            </label>
            <Combobox
              id="tour-status"
              options={statusOptions}
              value={status}
              onValueChange={(next) => narrow(() => setStatus(next))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tour-country" className="text-muted-foreground text-xs font-medium">
              Country
            </label>
            <Combobox
              id="tour-country"
              options={countryOptions}
              value={country}
              onValueChange={(next) => narrow(() => chooseCountry(next))}
              searchPlaceholder="Search countries…"
              emptyText="No country has a destination yet."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tour-location" className="text-muted-foreground text-xs font-medium">
              Location
            </label>
            <Combobox
              id="tour-location"
              options={locationOptions}
              value={location}
              onValueChange={(next) => narrow(() => setLocation(next))}
              searchPlaceholder="Search locations…"
              emptyText={country === ALL ? 'No locations yet.' : `No locations in ${country} yet.`}
            />
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
            leadingIcon={<RotateCcw aria-hidden />}
            disabled={!hasFilters}
            onClick={() =>
              narrow(() => {
                setSearch('');
                setStatus(ALL);
                setCountry(ALL);
                setLocation(ALL);
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
