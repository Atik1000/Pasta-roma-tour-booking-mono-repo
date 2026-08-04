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
import {
  isApiClientError,
  type AdminBookingDetail,
  type PaymentStatusValue,
} from '@pasta/api-client';
import type { CurrencyCode } from '@pasta/types';
import { formatDateTime, formatMoney } from '@pasta/utils';
import { useMutation } from '@tanstack/react-query';
import { Lock } from 'lucide-react';

import { adminApi } from '@/lib/session';

type Payment = NonNullable<AdminBookingDetail['payment']>;

/**
 * Every way a payment can be recorded, not just the two a traveller can choose
 * at checkout — staff settle bookings by means the site never offers.
 */
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'PAY_LATER', label: 'Pay Later' },
  { value: 'CARD', label: 'Credit Card' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'APPLE_PAY', label: 'Apple Pay' },
];

const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((entry) => [entry.value, entry.label]),
);

/**
 * Every state a manually-recorded payment can be filed under.
 *
 * FAILED and REFUNDED are the reason this is a control rather than a derived
 * label: no amount implies either of them, so before this there was no way at
 * all to record a declined card or money handed back at the desk.
 */
const PAYMENT_STATUSES: { value: PaymentStatusValue; label: string; hint: string }[] = [
  { value: 'PAID', label: 'Paid', hint: 'The money has been received in full.' },
  { value: 'PENDING', label: 'Pending', hint: 'Still owed — nothing has been collected yet.' },
  { value: 'REFUNDED', label: 'Refunded', hint: 'The amount below was returned to the customer.' },
  { value: 'FAILED', label: 'Failed', hint: 'The attempt did not go through.' },
];

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
 * The status is a field here rather than a number the server infers. Deriving
 * it from the amount could only ever produce Pending or Paid, so there was no
 * way at all to file a declined card as Failed or to record money handed back
 * at the desk — the two states an operator most needs to write down. The
 * booking's own payment status follows whatever is saved.
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
  const [status, setStatus] = React.useState<PaymentStatusValue>(payment.status);
  const [transactionId, setTransactionId] = React.useState(payment.transactionId ?? '');
  const [amount, setAmount] = React.useState((payment.amountMinor / 100).toFixed(2));
  const [paidAt, setPaidAt] = React.useState(toLocalInput(payment.paidAt));
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Pay Later means the traveller walks away owing the money: there is no
   * receipt number, no amount taken and no date it arrived. Leaving the three
   * fields live invited someone to fill them in for a payment that has not
   * happened, so they go blank and read-only, and the status is fixed at
   * Pending until the booking is actually settled by some other means.
   */
  const payLater = method === 'PAY_LATER';
  const effectiveStatus: PaymentStatusValue = payLater ? 'PENDING' : status;

  function reset() {
    setMethod(payment.method);
    setStatus(payment.status);
    setTransactionId(payment.transactionId ?? '');
    setAmount((payment.amountMinor / 100).toFixed(2));
    setPaidAt(toLocalInput(payment.paidAt));
    setError(null);
  }

  const save = useMutation({
    mutationFn: () =>
      adminApi.admin.updatePayment(payment.id, {
        method,
        // The API clears these for Pay Later regardless; sending the emptied
        // values keeps what was submitted matching what the operator saw.
        transactionId: payLater ? '' : transactionId,
        amountMinor: payLater ? 0 : Math.round(Number(amount || '0') * 100),
        paidAt: !payLater && paidAt ? new Date(paidAt).toISOString() : undefined,
        status: effectiveStatus,
      }),
    onSuccess: async () => {
      setError(null);
      toast.success('Payment record updated', 'The booking now reads the same status.');
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

  const dirty = payLater
    ? // Switching to Pay Later is itself a change whenever it clears something.
      method !== payment.method ||
      payment.transactionId !== null ||
      payment.amountMinor !== 0 ||
      payment.paidAt !== null ||
      payment.status !== 'PENDING'
    : method !== payment.method ||
      status !== payment.status ||
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

      <FormField
        label="Payment Status"
        hint={
          payLater
            ? 'Pay Later is always pending — there is nothing collected to mark paid.'
            : PAYMENT_STATUSES.find((entry) => entry.value === status)?.hint
        }
      >
        <Select
          value={effectiveStatus}
          disabled={payLater}
          onValueChange={(next) => setStatus(next as PaymentStatusValue)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_STATUSES.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {payLater ? (
        <p className="text-muted-foreground rounded-field bg-muted/50 flex gap-2.5 p-3 text-xs">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Nothing has been collected on a Pay Later booking, so there is no receipt number, amount
            or date to record. Change the method once the money is taken and the fields come back.
          </span>
        </p>
      ) : null}

      <FormField label="Transaction ID" hint="Reference from the terminal, bank or receipt.">
        <Input
          value={payLater ? '' : transactionId}
          disabled={payLater}
          onChange={(event) => setTransactionId(event.target.value)}
          placeholder={payLater ? 'Not applicable' : 'None recorded'}
        />
      </FormField>

      <FormField label="Paid Amount" hint="What was actually collected, in the booking's currency.">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={payLater ? '' : amount}
            disabled={payLater}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={payLater ? 'Not applicable' : undefined}
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
          value={payLater ? '' : paidAt}
          disabled={payLater}
          onChange={(event) => setPaidAt(event.target.value)}
        />
      </FormField>

      <div className="flex items-center justify-between gap-3">
        {/* The stored status, next to the one being chosen — so an unsaved
            change is visibly not the record yet. */}
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
