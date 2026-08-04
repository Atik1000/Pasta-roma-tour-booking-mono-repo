'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { formatDateTime, formatMoney, humanizeEnum } from '@pasta/utils';
import { ExternalLink, RotateCcw, Search, Undo2 } from 'lucide-react';

import { isApiClientError, type AdminPayment } from '@pasta/api-client';

import { useDebouncedValue } from '@/lib/use-debounced-value';
import { adminApi } from '@/lib/session';

/** The advanced filters behind the Filters button. */
interface Advanced {
  from: string;
  to: string;
}

const NO_ADVANCED: Advanced = { from: '', to: '' };

export function PaymentsTable() {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('ALL');
  const [method, setMethod] = React.useState('ALL');
  const [advanced, setAdvanced] = React.useState<Advanced>(NO_ADVANCED);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(10);
  const [refundTarget, setRefundTarget] = React.useState<AdminPayment | null>(null);
  const [refundError, setRefundError] = React.useState<string | null>(null);
  const [refundNotice, setRefundNotice] = React.useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  /** Any narrowing change returns to page 1. */
  function narrow(apply: () => void) {
    apply();
    setPage(1);
  }

  const activeAdvanced = Object.values(advanced).filter((entry) => entry !== '').length;

  const toast = useToast();

  const queryClient = useQueryClient();

  /**
   * Refunds the balance still outstanding, not the original amount — refunding
   * a partly refunded payment in full would ask Stripe for more than it holds.
   */
  const refund = useMutation({
    mutationFn: (payment: AdminPayment) =>
      adminApi.admin.refundPayment(payment.id, payment.amountMinor - payment.refundedMinor),
    onSuccess: (result) => {
      setRefundError(null);
      setRefundTarget(null);
      toast.success('Refund submitted', result.message);
      setRefundNotice(result.message);
      // Stripe writes the local record via `charge.refunded`, so the row may
      // take a moment to catch up.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
      window.setTimeout(() => setRefundNotice(null), 6000);
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught)
        ? caught.message
        : 'That refund could not be submitted.';
      setRefundError(message);
      toast.error('Refund failed', message);
    },
  });
  /**
   * Every filter is applied by the API.
   *
   * They used to be applied in the browser to whichever page happened to be
   * loaded, so searching for a transaction that lived on page 5 found nothing
   * and the row count contradicted the pager.
   */
  const query = useQuery({
    queryKey: ['admin', 'payments', { debouncedSearch, status, method, advanced, page, perPage }],
    queryFn: () =>
      adminApi.admin.payments({
        search: debouncedSearch.trim() || undefined,
        status,
        method,
        from: advanced.from || undefined,
        to: advanced.to || undefined,
        page,
        limit: perPage,
      }),
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  const columns = React.useMemo<ColumnDef<AdminPayment, unknown>[]>(
    () => [
      {
        id: 'transaction',
        header: 'Transaction',
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block font-mono text-xs">{row.original.transactionId}</span>
            <span className="text-muted-foreground block text-xs">{row.original.id}</span>
          </span>
        ),
      },
      {
        id: 'booking',
        header: 'Booking',
        cell: ({ row }) => (
          <Link
            href={`/bookings/${row.original.bookingReference}`}
            className="text-primary inline-flex items-center gap-1.5 hover:underline"
          >
            {row.original.bookingReference}
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ),
      },
      { id: 'customer', header: 'Customer', cell: ({ row }) => row.original.customerName },
      {
        id: 'method',
        header: 'Method',
        cell: ({ row }) => humanizeEnum(row.original.method),
      },
      {
        id: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="block tabular-nums">
            {formatMoney(row.original.amountMinor, row.original.currency)}
            {row.original.refundedMinor > 0 ? (
              <span className="text-info block text-xs">
                −{formatMoney(row.original.refundedMinor, row.original.currency)} refunded
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'paidAt',
        header: 'Paid On',
        cell: ({ row }) =>
          row.original.paidAt ? (
            <span className="text-muted-foreground whitespace-nowrap text-sm">
              {formatDateTime(row.original.paidAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="subtle"
              size="sm"
              leadingIcon={<Undo2 aria-hidden />}
              disabled={row.original.status !== 'PAID'}
              onClick={() => setRefundTarget(row.original)}
            >
              Refund
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const hasFilters = search !== '' || status !== 'ALL' || method !== 'ALL' || activeAdvanced > 0;

  return (
    <div className="flex flex-col gap-6">
      {refundNotice ? (
        <p
          role="status"
          className="border-success/30 bg-success-soft text-success-foreground rounded-card border px-4 py-3 text-sm"
        >
          {refundNotice}
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_13rem_13rem_auto_auto]">
          <div>
            <label htmlFor="payment-search" className="sr-only">
              Search payments
            </label>
            <Input
              id="payment-search"
              type="search"
              value={search}
              onChange={(event) => narrow(() => setSearch(event.target.value))}
              placeholder="Search by transaction, booking, or customer..."
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="payment-status-filter" className="text-muted-foreground text-xs">
              Status
            </label>
            <Select value={status} onValueChange={(next) => narrow(() => setStatus(next))}>
              <SelectTrigger id="payment-status-filter" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="payment-method-filter" className="text-muted-foreground text-xs">
              Method
            </label>
            <Select value={method} onValueChange={(next) => narrow(() => setMethod(next))}>
              <SelectTrigger id="payment-method-filter" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Methods</SelectItem>
                {/* Cash leads — it is what the checkout offers besides a card.
                    Pay Later is absent on purpose: no money has moved, so those
                    bookings never appear on this screen at all. */}
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="PAYPAL">PayPal</SelectItem>
                <SelectItem value="APPLE_PAY">Apple Pay</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <FilterPanel
            activeCount={activeAdvanced}
            onClear={() => narrow(() => setAdvanced(NO_ADVANCED))}
          >
            <FilterRange legend="Captured between">
              <Input
                type="date"
                aria-label="Paid on or after"
                value={advanced.from}
                onChange={(event) =>
                  narrow(() => setAdvanced({ ...advanced, from: event.target.value }))
                }
              />
              <Input
                type="date"
                aria-label="Paid on or before"
                value={advanced.to}
                onChange={(event) =>
                  narrow(() => setAdvanced({ ...advanced, to: event.target.value }))
                }
              />
            </FilterRange>
            <p className="text-muted-foreground text-xs">
              Pending and failed payments have no capture date, so a date range excludes them.
            </p>
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
                setMethod('ALL');
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
        emptyTitle="No payments match your filters"
        emptyDescription="Adjust the search or reset the filters to see every payment."
      />

      <TableFooter
        page={page}
        perPage={perPage}
        rowCount={rows.length}
        total={total}
        noun="payments"
        onPageChange={setPage}
        onPerPageChange={(next) => narrow(() => setPerPage(next))}
      />

      {/* Refunds are irreversible, so they are confirmed rather than one-click. */}
      <Dialog open={refundTarget !== null} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Refund this payment?</DialogTitle>
            <DialogDescription>
              {refundTarget
                ? `${formatMoney(
                    refundTarget.amountMinor - refundTarget.refundedMinor,
                    refundTarget.currency,
                  )} will be returned to ${refundTarget.customerName} on booking ${refundTarget.bookingReference}. This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>

          {refundError ? (
            <p role="alert" className="text-danger-foreground text-sm">
              {refundError}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundTarget(null)}>
              Keep payment
            </Button>
            <Button
              variant="destructive"
              isLoading={refund.isPending}
              onClick={() => refundTarget && refund.mutate(refundTarget)}
            >
              Issue refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
