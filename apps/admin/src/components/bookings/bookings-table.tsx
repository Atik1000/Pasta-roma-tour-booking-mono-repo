'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FilterPanel,
  FilterRange,
  Combobox,
  Input,
  StatusPill,
  TableFooter,
  type ColumnDef,
  type ComboboxOption,
  useToast,
} from '@pasta/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatMoney } from '@pasta/utils';
import { Eye, MoreVertical, Printer, RotateCcw, Search, X } from 'lucide-react';

import { isApiClientError, type AdminBooking } from '@pasta/api-client';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { printBlob, saveBlob } from '@/lib/download';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { adminApi } from '@/lib/session';

export interface BookingFilters {
  search: string;
  status: string;
  payment: string;
  /** Tour id, or 'ALL'. The design's third select. */
  tour: string;
  /** Advanced: booked-on range and booking-total bounds, as typed. */
  from: string;
  to: string;
  minAmount: string;
  maxAmount: string;
}

export const NO_BOOKING_FILTERS: BookingFilters = {
  search: '',
  status: 'ALL',
  payment: 'ALL',
  tour: 'ALL',
  from: '',
  to: '',
  minAmount: '',
  maxAmount: '',
};

/** Major units as typed, to the minor units the API stores. */
function toMinor(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

/** The request shape shared by the table query and the CSV export. */
export function bookingQueryParams(filters: BookingFilters) {
  return {
    search: filters.search.trim() || undefined,
    status: filters.status,
    paymentStatus: filters.payment,
    tourId: filters.tour === 'ALL' ? undefined : filters.tour,
    from: filters.from || undefined,
    to: filters.to || undefined,
    minAmountMinor: toMinor(filters.minAmount),
    maxAmountMinor: toMinor(filters.maxAmount),
  };
}

/**
 * The filters live above this component so the header's Export button can send
 * the same narrowing to the server — an export that ignored the filters would
 * not match what the operator is looking at.
 */
export function BookingsTable({
  filters,
  onFiltersChange,
  tours,
}: {
  filters: BookingFilters;
  onFiltersChange: (next: BookingFilters) => void;
  /** Every tour, for the Tours select. */
  tours: { id: string; title: string }[];
}) {
  const { search, status, payment, tour } = filters;
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(10);
  const [busyRow, setBusyRow] = React.useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = React.useState<AdminBooking | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  /**
   * Any narrowing change returns to page 1. The status and payment selects used
   * to leave the page where it was, so changing them on page 12 of 19 showed an
   * empty table that read as "no bookings match".
   */
  function narrow(changes: Partial<BookingFilters>) {
    onFiltersChange({ ...filters, ...changes });
    setPage(1);
  }

  const activeAdvanced = [filters.from, filters.to, filters.minAmount, filters.maxAmount].filter(
    (entry) => entry !== '',
  ).length;

  const statusOptions = React.useMemo<ComboboxOption[]>(
    () => [
      { value: 'ALL', label: 'All statuses' },
      { value: 'CONFIRMED', label: 'Confirmed' },
      { value: 'PENDING', label: 'Pending' },
      { value: 'CANCELLED', label: 'Cancelled' },
    ],
    [],
  );

  const paymentOptions = React.useMemo<ComboboxOption[]>(
    () => [
      // Short enough to fit the trigger; the field's own label already says
      // which status this is.
      { value: 'ALL', label: 'All payments' },
      { value: 'PAID', label: 'Paid' },
      { value: 'PENDING', label: 'Pending' },
      { value: 'REFUNDED', label: 'Refunded' },
      { value: 'FAILED', label: 'Failed' },
    ],
    [],
  );

  // The catalogue runs to a hundred entries, which is well past the point a
  // plain scrolling list stops being findable.
  const tourOptions = React.useMemo<ComboboxOption[]>(
    () => [
      { value: 'ALL', label: 'All tours' },
      ...tours.map((entry) => ({ value: entry.id, label: entry.title })),
    ],
    [tours],
  );

  const toast = useToast();

  const queryClient = useQueryClient();

  function announce(tone: 'ok' | 'error', message: string) {
    if (tone === 'ok') toast.success(message);
    else toast.error('That did not work', message);
  }

  function failed(caught: unknown, fallback: string) {
    announce('error', isApiClientError(caught) ? caught.message : fallback);
  }

  /**
   * Row actions are one-at-a-time: `busyRow` disables the row being worked on
   * so a double click cannot send two confirmation emails.
   */
  async function runRowAction(reference: string, action: () => Promise<void>) {
    setBusyRow(reference);
    try {
      await action();
    } finally {
      setBusyRow(null);
    }
  }

  const printInvoice = (reference: string) =>
    runRowAction(reference, () =>
      adminApi.admin
        .invoicePdf(reference)
        .then(printBlob)
        .catch((caught: unknown) => failed(caught, 'Could not produce that invoice.')),
    );

  const downloadTickets = (reference: string) =>
    runRowAction(reference, () =>
      adminApi.admin
        .ticketsPdf(reference)
        .then((pdf) => saveBlob(pdf, `${reference}-tickets.pdf`))
        .catch((caught: unknown) => failed(caught, 'Could not produce those tickets.')),
    );

  const resendConfirmation = (reference: string) =>
    runRowAction(reference, () =>
      adminApi.admin
        .sendConfirmation(reference)
        .then((result) => announce('ok', `Confirmation sent to ${result.sentTo}.`))
        .catch((caught: unknown) => failed(caught, 'Could not send that email.')),
    );

  const cancelBooking = useMutation({
    mutationFn: (booking: AdminBooking) => adminApi.admin.cancelBooking(booking.reference),
    onSuccess: (_result, booking) => {
      setPendingCancel(null);
      announce('ok', `Booking ${booking.reference} cancelled.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    },
    onError: (caught) => {
      setPendingCancel(null);
      failed(caught, 'Could not cancel that booking.');
    },
  });

  const query = useQuery({
    queryKey: ['admin', 'bookings', { ...filters, search: debouncedSearch, page, perPage }],
    queryFn: () =>
      adminApi.admin.bookings({
        ...bookingQueryParams({ ...filters, search: debouncedSearch }),
        page,
        limit: perPage,
      }),
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  const columns = React.useMemo<ColumnDef<AdminBooking, unknown>[]>(
    () => [
      {
        id: 'reference',
        header: 'Booking ID',
        cell: ({ row }) => (
          <Link
            href={`/bookings/${row.original.reference}`}
            className="text-primary whitespace-nowrap font-medium hover:underline"
          >
            {row.original.reference}
          </Link>
        ),
      },
      {
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block font-medium">{row.original.customerName}</span>
            <span className="text-muted-foreground block truncate text-xs">
              {row.original.customerEmail}
            </span>
          </span>
        ),
      },
      // Tours and ticket counts were dropped from this table: both are per-item
      // detail that the booking screen lays out properly, and neither survived
      // being squeezed into a column. The Tours filter above still narrows by
      // them.
      {
        id: 'amount',
        header: 'Total Amount',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMoney(row.original.totalMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'payment',
        header: 'Payment Status',
        cell: ({ row }) => <StatusPill status={row.original.paymentStatus} />,
      },
      {
        id: 'status',
        header: 'Booking Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'bookedAt',
        header: 'Booked On',
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap text-sm">
            {formatDateTime(row.original.bookedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="subtle"
              size="icon"
              asChild
              aria-label={`View ${row.original.reference}`}
            >
              <Link href={`/bookings/${row.original.reference}`}>
                <Eye aria-hidden />
              </Link>
            </Button>
            <Button
              variant="subtle"
              size="icon"
              aria-label={`Print invoice for ${row.original.reference}`}
              disabled={busyRow === row.original.reference}
              onClick={() => void printInvoice(row.original.reference)}
            >
              <Printer aria-hidden />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="subtle"
                  size="icon"
                  aria-label={`More actions for ${row.original.reference}`}
                >
                  <MoreVertical aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  disabled={row.original.status === 'CANCELLED'}
                  onSelect={() => void resendConfirmation(row.original.reference)}
                >
                  Resend confirmation
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void downloadTickets(row.original.reference)}>
                  Download tickets
                </DropdownMenuItem>
                <DropdownMenuItem
                  destructive
                  disabled={row.original.status === 'CANCELLED'}
                  onSelect={() => setPendingCancel(row.original)}
                >
                  <X aria-hidden />
                  Cancel booking
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyRow],
  );

  const hasFilters =
    search !== '' || status !== 'ALL' || payment !== 'ALL' || tour !== 'ALL' || activeAdvanced > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        {/*
          Every control carries a visible label of the same size and every one
          is h-11, so `items-end` lands the row on one baseline. Previously the
          search label was `sr-only` and the selects were shrunk to h-10, which
          left the search box sitting 20px above its neighbours.
        */}
        <CardContent className="grid items-end gap-x-3 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_11rem_12rem_13rem_auto_auto]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="booking-search" className="text-muted-foreground text-xs font-medium">
              Search
            </label>
            <Input
              id="booking-search"
              type="search"
              value={search}
              onChange={(event) => narrow({ search: event.target.value })}
              placeholder="Booking ID, customer or email…"
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="booking-status" className="text-muted-foreground text-xs font-medium">
              Booking Status
            </label>
            <Combobox
              id="booking-status"
              options={statusOptions}
              value={status}
              onValueChange={(next) => narrow({ status: next })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="payment-status" className="text-muted-foreground text-xs font-medium">
              Payment Status
            </label>
            <Combobox
              id="payment-status"
              options={paymentOptions}
              value={payment}
              onValueChange={(next) => narrow({ payment: next })}
            />
          </div>

          {/* A booking with two tours appears under both — this asks "contains
              this tour", not "is only this tour". */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="booking-tour" className="text-muted-foreground text-xs font-medium">
              Tours
            </label>
            <Combobox
              id="booking-tour"
              options={tourOptions}
              value={tour}
              onValueChange={(next) => narrow({ tour: next })}
              searchPlaceholder="Search tours…"
              emptyText="No tour matches that."
            />
          </div>

          <FilterPanel
            activeCount={activeAdvanced}
            onClear={() => narrow({ from: '', to: '', minAmount: '', maxAmount: '' })}
          >
            <FilterRange legend="Booked between">
              <Input
                type="date"
                aria-label="Booked on or after"
                value={filters.from}
                onChange={(event) => narrow({ from: event.target.value })}
              />
              <Input
                type="date"
                aria-label="Booked on or before"
                value={filters.to}
                onChange={(event) => narrow({ to: event.target.value })}
              />
            </FilterRange>

            <FilterRange legend="Total amount">
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Min"
                aria-label="Lowest booking total"
                value={filters.minAmount}
                onChange={(event) => narrow({ minAmount: event.target.value })}
              />
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Max"
                aria-label="Highest booking total"
                value={filters.maxAmount}
                onChange={(event) => narrow({ maxAmount: event.target.value })}
              />
            </FilterRange>
          </FilterPanel>

          <Button
            variant="ghost"
            leadingIcon={<RotateCcw aria-hidden />}
            disabled={!hasFilters}
            onClick={() => narrow(NO_BOOKING_FILTERS)}
          >
            Reset
          </Button>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={query.isLoading}
        emptyTitle="No bookings match your filters"
        emptyDescription="Adjust the search or reset the filters to see every booking."
      />

      <TableFooter
        page={page}
        perPage={perPage}
        rowCount={rows.length}
        total={total}
        noun="bookings"
        onPageChange={setPage}
        onPerPageChange={(next) => {
          setPerPage(next);
          setPage(1);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        onOpenChange={(open) => !open && setPendingCancel(null)}
        title="Cancel this booking?"
        description={
          pendingCancel
            ? `Booking ${pendingCancel.reference} will be cancelled and its seats released. This cannot be undone.`
            : ''
        }
        confirmLabel="Cancel booking"
        isPending={cancelBooking.isPending}
        onConfirm={() => pendingCancel && cancelBooking.mutate(pendingCancel)}
      />
    </div>
  );
}
