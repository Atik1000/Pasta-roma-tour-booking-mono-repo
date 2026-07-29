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
import { formatDateTime, formatMoney, humanizeEnum } from '@pasta/utils';
import { ExternalLink, RotateCcw, Search, Undo2 } from 'lucide-react';

import { isApiClientError, type AdminPayment } from '@pasta/api-client';

import { adminApi } from '@/lib/session';

export function PaymentsTable() {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('ALL');
  const [method, setMethod] = React.useState('ALL');
  const [page, setPage] = React.useState(1);
  const [refundTarget, setRefundTarget] = React.useState<AdminPayment | null>(null);
  const [refundError, setRefundError] = React.useState<string | null>(null);
  const [refundNotice, setRefundNotice] = React.useState<string | null>(null);

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
      setRefundNotice(result.message);
      // Stripe writes the local record via `charge.refunded`, so the row may
      // take a moment to catch up.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
      window.setTimeout(() => setRefundNotice(null), 6000);
    },
    onError: (caught: unknown) => {
      setRefundError(
        isApiClientError(caught) ? caught.message : 'That refund could not be submitted.',
      );
    },
  });
  const perPage = 10;

  const query = useQuery({
    queryKey: ['admin', 'payments', { page }],
    queryFn: () => adminApi.admin.payments({ page, limit: perPage }),
  });

  // The payments endpoint pages server-side; status and method narrow the
  // current page until those filters exist on the API.
  const rows = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data?.data ?? []).filter((payment) => {
      const matchesTerm =
        !term ||
        (payment.transactionId ?? '').toLowerCase().includes(term) ||
        payment.bookingReference.toLowerCase().includes(term) ||
        payment.customerName.toLowerCase().includes(term);
      const matchesStatus = status === 'ALL' || payment.status === status;
      const matchesMethod = method === 'ALL' || payment.method === method;
      return matchesTerm && matchesStatus && matchesMethod;
    });
  }, [query.data, search, status, method]);

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

  const hasFilters = search !== '' || status !== 'ALL' || method !== 'ALL';

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
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_13rem_13rem_auto]">
          <div>
            <label htmlFor="payment-search" className="sr-only">
              Search payments
            </label>
            <Input
              id="payment-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by transaction, booking, or customer..."
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="payment-status-filter" className="text-muted-foreground text-xs">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
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
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="payment-method-filter" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Methods</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="PAYPAL">PayPal</SelectItem>
                <SelectItem value="APPLE_PAY">Apple Pay</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="ghost"
            className="self-end"
            leadingIcon={<RotateCcw aria-hidden />}
            disabled={!hasFilters}
            onClick={() => {
              setSearch('');
              setStatus('ALL');
              setMethod('ALL');
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
        emptyTitle="No payments match your filters"
        emptyDescription="Adjust the search or reset the filters to see every payment."
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Showing {rows.length} of {total} payments
        </p>
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(total / perPage))}
          onPageChange={setPage}
        />
      </div>

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
