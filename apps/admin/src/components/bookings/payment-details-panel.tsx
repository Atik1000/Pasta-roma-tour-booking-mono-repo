'use client';

import * as React from 'react';

import {
  Button,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  useToast,
} from '@pasta/ui';
import { isApiClientError, type AdminBookingDetail } from '@pasta/api-client';
import type { CurrencyCode } from '@pasta/types';
import { formatDateTime, formatMoney } from '@pasta/utils';
import { useMutation } from '@tanstack/react-query';
import { Lock } from 'lucide-react';

import { adminApi } from '@/lib/session';

type Payment = NonNullable<AdminBookingDetail['payment']>;

const PAYMENT_METHODS = [
  { value: 'CARD', label: 'Credit Card' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'APPLE_PAY', label: 'Apple Pay' },
  { value: 'CASH', label: 'Cash' },
];

const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((entry) => [entry.value, entry.label]),
);

/** An ISO timestamp as the value a `datetime-local` input wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Payment Details.
 *
 * The design draws this as a form, and it is one — for payments the business
 * recorded itself: cash at the meeting point, a bank transfer, a card taken over
 * the phone. Those have no processor record to contradict, so someone has to be
 * able to correct a typo in the amount or the receipt number.
 *
 * A Stripe-captured payment is shown read-only. That record is written by the
 * webhook and has to keep agreeing with the money Stripe actually holds — if an
 * operator could retype the captured amount, every invoice, CSV export and
 * revenue figure downstream would report a number nobody could verify, with no
 * way afterwards to tell which one was real. The API enforces this too, so the
 * lock is not merely a hidden button.
 *
 * The status is never submitted: the server derives it from the amount against
 * the booking total, so a part-payment cannot be filed as settled in full.
 */
export function PaymentDetailsPanel({
  payment,
  currency,
  onSaved,
}: {
  payment: Payment;
  currency: CurrencyCode;
  onSaved: () => void | Promise<unknown>;
}) {
  const toast = useToast();

  const [method, setMethod] = React.useState(payment.method);
  const [transactionId, setTransactionId] = React.useState(payment.transactionId ?? '');
  const [amount, setAmount] = React.useState((payment.amountMinor / 100).toFixed(2));
  const [paidAt, setPaidAt] = React.useState(toLocalInput(payment.paidAt));
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setMethod(payment.method);
    setTransactionId(payment.transactionId ?? '');
    setAmount((payment.amountMinor / 100).toFixed(2));
    setPaidAt(toLocalInput(payment.paidAt));
    setError(null);
  }

  const save = useMutation({
    mutationFn: () =>
      adminApi.admin.updatePayment(payment.id, {
        method,
        transactionId,
        amountMinor: Math.round(Number(amount || '0') * 100),
        paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
      }),
    onSuccess: async () => {
      setError(null);
      toast.success('Payment record updated', 'The booking’s payment status was recalculated.');
      await onSaved();
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught)
        ? caught.message
        : 'Could not save that payment record.';
      setError(message);
      toast.error('Payment not saved', message);
    },
  });

  if (!payment.isManual) {
    return (
      <>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Payment Method</dt>
            <dd className="font-medium">
              {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusPill status={payment.status} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Paid Amount</dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(payment.amountMinor, currency)} ({currency})
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Payment Date</dt>
            <dd className="font-medium">
              {payment.paidAt ? formatDateTime(payment.paidAt) : 'Not yet'}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Transaction ID</dt>
            <dd className="break-all font-mono text-xs">
              {payment.transactionId ?? 'None recorded'}
            </dd>
          </div>
        </dl>

        <p className="text-muted-foreground rounded-field bg-muted/50 mt-4 flex gap-2.5 p-3 text-xs">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Captured by Stripe, so this is its record to keep. Use <strong>Refund</strong> on the
            Payments screen to return money, or add an order note to explain a discrepancy.
          </span>
        </p>
      </>
    );
  }

  const dirty =
    method !== payment.method ||
    transactionId !== (payment.transactionId ?? '') ||
    Math.round(Number(amount || '0') * 100) !== payment.amountMinor ||
    paidAt !== toLocalInput(payment.paidAt);

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-danger-foreground text-sm">
          {error}
        </p>
      ) : null}

      <FormField label="Payment Method">
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="Transaction ID" hint="Reference from the terminal, bank or receipt.">
        <Input
          value={transactionId}
          onChange={(event) => setTransactionId(event.target.value)}
          placeholder="None recorded"
        />
      </FormField>

      <FormField
        label="Paid Amount"
        hint="The payment status is recalculated from this against the booking total."
      >
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label={`Paid amount in ${currency}`}
          />
          <span className="text-muted-foreground rounded-field border-border border px-3 py-2 text-sm">
            {currency}
          </span>
        </div>
      </FormField>

      <FormField label="Payment Date">
        <Input
          type="datetime-local"
          value={paidAt}
          onChange={(event) => setPaidAt(event.target.value)}
        />
      </FormField>

      <div className="flex items-center justify-between gap-3">
        <StatusPill status={payment.status} />
        <div className="flex gap-2.5">
          <Button variant="ghost" size="sm" disabled={!dirty} onClick={reset}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            isLoading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save Changes
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Recorded manually, so it can be corrected here. Every change is written to the activity log.
      </p>
    </div>
  );
}
