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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  TableFooter,
  type ColumnDef,
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
            className="text-primary font-medium hover:underline"
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
      {
        id: 'tours',
        header: 'Tours',
        cell: ({ row }) => (
          <span className="block min-w-0 max-w-56">
            <span className="block text-sm">
              {row.original.tours.length} {row.original.tours.length === 1 ? 'Tour' : 'Tours'}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {row.original.tours.join(', ')}
            </span>
          </span>
        ),
      },
      {
        id: 'tickets',
        header: 'Total Tickets',
        cell: ({ row }) => <span className="tabular-nums">{row.original.tickets}</span>,
      },
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
        <CardContent className="grid gap-3 p-4 xl:grid-cols-[1fr_12rem_13rem_12rem_auto_auto]">
          <div>
            <label htmlFor="booking-search" className="sr-only">
              Search bookings
            </label>
            <Input
              id="booking-search"
              type="search"
              value={search}
              onChange={(event) => narrow({ search: event.target.value })}
              placeholder="Search by booking ID, customer, or email..."
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="booking-status" className="text-muted-foreground text-xs">
              Booking Status
            </label>
            <Select value={status} onValueChange={(next) => narrow({ status: next })}>
              <SelectTrigger id="booking-status" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="payment-status" className="text-muted-foreground text-xs">
              Payment Status
            </label>
            <Select value={payment} onValueChange={(next) => narrow({ payment: next })}>
              <SelectTrigger id="payment-status" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Payment Statuses</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* A booking with two tours appears under both — this asks "contains
              this tour", not "is only this tour". */}
          <div className="flex flex-col gap-1">
            <label htmlFor="booking-tour" className="text-muted-foreground text-xs">
              Tours
            </label>
            <Select value={tour} onValueChange={(next) => narrow({ tour: next })}>
              <SelectTrigger id="booking-tour" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Tours</SelectItem>
                {tours.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            className="self-end"
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
