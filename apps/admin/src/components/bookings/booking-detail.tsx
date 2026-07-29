'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  Textarea,
} from '@pasta/ui';
import { formatClockTime, formatDate, formatDateTime, formatMoney } from '@pasta/utils';
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Clock,
  Mail,
  MessageSquare,
  Download,
  Plus,
  Printer,
  Settings,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';

import { isApiClientError, type AdminBookingDetail } from '@pasta/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AddBookingItemDialog } from '@/components/bookings/add-booking-item-dialog';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { printBlob, saveBlob } from '@/lib/download';
import { adminApi } from '@/lib/session';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CARD: 'Credit Card',
  PAYPAL: 'PayPal',
  APPLE_PAY: 'Apple Pay',
};

/**
 * Booking detail. Everything on this screen is editable — customer, ticket
 * holders, quantities, payment record — because the design shows inputs rather
 * than read-only text, and support staff need to correct bookings in place.
 */
export function BookingDetail({ booking }: { booking: AdminBookingDetail }) {
  const [status, setStatus] = React.useState(booking.status);
  const [fullName, setFullName] = React.useState(booking.customer.fullName);
  const [email, setEmail] = React.useState(booking.customer.email);
  const [notes, setNotes] = React.useState<string[]>(booking.notes.map((note) => note.body));
  const [draftNote, setDraftNote] = React.useState('');
  const [showNoteField, setShowNoteField] = React.useState(false);

  // Items are server records now, so the props are the source of truth and a
  // successful edit refetches rather than patching local state.
  const items = booking.items;
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [busyItem, setBusyItem] = React.useState<string | null>(null);
  const [addingTour, setAddingTour] = React.useState(false);
  const [pendingRemoval, setPendingRemoval] = React.useState<(typeof booking.items)[number] | null>(
    null,
  );
  const [documentNotice, setDocumentNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const queryClient = useQueryClient();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'booking'] });

  function documentFailed(caught: unknown, fallback: string) {
    setError(isApiClientError(caught) ? caught.message : fallback);
  }

  /**
   * Quantity changes claim or release seats server-side, so the response is
   * authoritative and the screen refetches instead of guessing.
   */
  async function changeQuantity(itemId: string, quantity: number) {
    setBusyItem(itemId);
    setError(null);

    try {
      await adminApi.admin.updateBookingItem(booking.reference, itemId, { quantity });
      setQuantities((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      await refresh();
    } catch (caught: unknown) {
      documentFailed(caught, 'Could not change that quantity.');
    } finally {
      setBusyItem(null);
    }
  }

  const removeItem = useMutation({
    mutationFn: (itemId: string) => adminApi.admin.removeBookingItem(booking.reference, itemId),
    onSuccess: () => {
      setError(null);
      setPendingRemoval(null);
      void refresh();
    },
    onError: (caught) => {
      setPendingRemoval(null);
      documentFailed(caught, 'Could not remove that tour.');
    },
  });

  const printInvoice = useMutation({
    mutationFn: () => adminApi.admin.invoicePdf(booking.reference),
    onSuccess: (pdf) => {
      setError(null);
      printBlob(pdf);
    },
    onError: (caught) => documentFailed(caught, 'Could not produce that invoice.'),
  });

  const downloadTickets = useMutation({
    mutationFn: () => adminApi.admin.ticketsPdf(booking.reference),
    onSuccess: (pdf) => {
      setError(null);
      saveBlob(pdf, `${booking.reference}-tickets.pdf`);
    },
    onError: (caught) => documentFailed(caught, 'Could not produce those tickets.'),
  });

  const sendConfirmation = useMutation({
    mutationFn: () => adminApi.admin.sendConfirmation(booking.reference),
    onSuccess: (result) => {
      setError(null);
      setDocumentNotice(`Confirmation sent to ${result.sentTo}.`);
      // The resend leaves a note on the booking, so the timeline is refetched.
      void refresh();
      window.setTimeout(() => setDocumentNotice(null), 5000);
    },
    onError: (caught) => documentFailed(caught, 'Could not send that email.'),
  });

  const saveCustomer = useMutation({
    mutationFn: () => adminApi.admin.updateBooking(booking.reference, { fullName, email, status }),
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (caught: unknown) =>
      setError(isApiClientError(caught) ? caught.message : 'Could not save those details.'),
  });

  const addNote = useMutation({
    mutationFn: (body: string) => adminApi.admin.addBookingNote(booking.reference, body),
    onSuccess: () => void refresh(),
  });

  const cancelBooking = useMutation({
    mutationFn: () => adminApi.admin.cancelBooking(booking.reference),
    onSuccess: () => {
      setConfirmCancel(false);
      setStatus('CANCELLED');
      void refresh();
    },
    onError: (caught: unknown) => {
      setConfirmCancel(false);
      setError(isApiClientError(caught) ? caught.message : 'Could not cancel that booking.');
    },
  });

  // Money comes from the booking record, not from summing the lines: the
  // booking fee is charged per booking and would otherwise vanish from every
  // "Total Amount" on this screen.
  const subtotal = booking.subtotalMinor;
  const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="border-danger/30 bg-danger-soft text-danger-foreground rounded-card border px-4 py-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      {documentNotice ? (
        <p
          role="status"
          className="border-success/30 bg-success-soft text-success-foreground rounded-card border px-4 py-3 text-sm"
        >
          {documentNotice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild leadingIcon={<ArrowLeft aria-hidden />}>
            <Link href="/bookings">Back to Bookings</Link>
          </Button>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Booking #{booking.reference}</h1>
            <Select value={status} onValueChange={(next) => setStatus(next as typeof status)}>
              <SelectTrigger className="h-9 w-40" aria-label="Booking status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-muted-foreground mt-1 text-sm">
            Booked on {formatDateTime(booking.bookedAt)} • Payment Status:{' '}
            <span className="text-success">{booking.paymentStatus}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="outline"
            leadingIcon={<Download aria-hidden />}
            isLoading={downloadTickets.isPending}
            onClick={() => downloadTickets.mutate()}
          >
            Download Tickets
          </Button>
          <Button
            variant="outline"
            leadingIcon={<Printer aria-hidden />}
            isLoading={printInvoice.isPending}
            onClick={() => printInvoice.mutate()}
          >
            Print Invoice
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold">
              <Briefcase className="text-primary size-5" aria-hidden />
              Booking Information
            </h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Booking ID</dt>
                <dd className="font-medium">{booking.reference}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Booking Date</dt>
                <dd className="font-medium">{formatDateTime(booking.bookedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Total Amount</dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(booking.totalMinor, booking.currency)} ({booking.currency})
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Payment Status</dt>
                <dd>
                  <StatusPill status={booking.paymentStatus} />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold">
              <User className="text-primary size-5" aria-hidden />
              Booked By (Customer)
            </h2>
            <div className="flex flex-col gap-4">
              <FormField label="Full Name">
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </FormField>
              <FormField label="Email Address">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  leadingIcon={<Mail aria-hidden />}
                />
              </FormField>
              <div className="flex justify-end gap-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFullName(booking.customer.fullName);
                    setEmail(booking.customer.email);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  isLoading={saveCustomer.isPending}
                  onClick={() => saveCustomer.mutate()}
                >
                  {saveCustomer.isSuccess ? 'Saved' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Booking Summary</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Total Tours</dt>
                <dd className="font-medium tabular-nums">{items.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Total Tickets</dt>
                <dd className="font-medium tabular-nums">{totalTickets}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Total Amount</dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(booking.totalMinor, booking.currency)} ({booking.currency})
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                  <Briefcase className="text-primary size-5" aria-hidden />
                  Tours &amp; Tickets
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  leadingIcon={<Plus aria-hidden />}
                  disabled={status === 'CANCELLED'}
                  onClick={() => setAddingTour(true)}
                >
                  Add Tour
                </Button>
              </div>

              {items.length === 0 ? (
                <p className="text-muted-foreground rounded-field border-border border border-dashed p-6 text-center text-sm">
                  This booking has no tours. Add one to give it a value.
                </p>
              ) : null}

              <div className="flex flex-col gap-5">
                {items.map((item) => {
                  const draft = quantities[item.id];
                  const pendingQuantity = draft === undefined ? item.quantity : Number(draft) || 0;
                  const changed = pendingQuantity !== item.quantity && pendingQuantity >= 1;
                  const busy = busyItem === item.id;

                  return (
                    <div key={item.id} className="rounded-card border-border border">
                      <div className="flex flex-wrap items-start gap-4 p-4">
                        <span
                          role="img"
                          aria-label={item.title}
                          className="rounded-field h-14 w-20 shrink-0 bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium">{item.title}</h3>
                          <ul className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            <li className="inline-flex items-center gap-1.5">
                              <CalendarDays className="size-4" aria-hidden />
                              {formatDate(item.date)}
                            </li>
                            <li className="inline-flex items-center gap-1.5">
                              <Clock className="size-4" aria-hidden />
                              {formatClockTime(item.time)}
                            </li>
                          </ul>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="subtle"
                            size="icon"
                            aria-label={`Remove ${item.title}`}
                            className="text-danger hover:bg-danger-soft"
                            disabled={busy || status === 'CANCELLED'}
                            onClick={() => setPendingRemoval(item)}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      </div>

                      <div className="border-border overflow-x-auto border-t">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-border bg-muted/40 text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                              <th scope="col" className="px-4 py-2.5 font-medium">
                                Ticket Type
                              </th>
                              <th scope="col" className="px-4 py-2.5 font-medium">
                                Unit Price
                              </th>
                              <th scope="col" className="px-4 py-2.5 font-medium">
                                Quantity
                              </th>
                              <th scope="col" className="px-4 py-2.5 font-medium">
                                Ticket Holders
                              </th>
                              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                                Line Total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-4 py-3">
                                {/* Adults only — child tickets were removed from the product. */}
                                Adult ({booking.currency})
                              </td>
                              <td className="px-4 py-3 tabular-nums">
                                {/* The price agreed at booking time, not today's. */}
                                {formatMoney(item.unitPriceMinor, booking.currency)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    className="h-9 w-20"
                                    type="number"
                                    min="1"
                                    aria-label={`Quantity for ${item.title}`}
                                    value={draft ?? String(item.quantity)}
                                    disabled={busy || status === 'CANCELLED'}
                                    onChange={(event) =>
                                      setQuantities((current) => ({
                                        ...current,
                                        [item.id]: event.target.value,
                                      }))
                                    }
                                  />
                                  {changed ? (
                                    <Button
                                      size="sm"
                                      isLoading={busy}
                                      onClick={() => void changeQuantity(item.id, pendingQuantity)}
                                    >
                                      Save
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <ul className="flex flex-col gap-1">
                                  {item.holders.map((holder, index) => (
                                    <li
                                      key={`${item.id}-${index}`}
                                      className="flex items-center gap-2"
                                    >
                                      <span
                                        className="bg-primary size-1.5 rounded-full"
                                        aria-hidden
                                      />
                                      {holder}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {formatMoney(item.amountMinor, booking.currency)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="border-border flex justify-end border-t p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          leadingIcon={<Plus aria-hidden />}
                          disabled={busy || status === 'CANCELLED'}
                          onClick={() => void changeQuantity(item.id, item.quantity + 1)}
                        >
                          Add Ticket
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Price Breakdown</h2>
              <dl className="flex flex-col gap-2.5 text-sm">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">
                      {item.title} ({item.quantity} × Adult)
                    </dt>
                    <dd className="tabular-nums">
                      {formatMoney(item.amountMinor, booking.currency)}
                    </dd>
                  </div>
                ))}
                <div className="border-border flex justify-between gap-4 border-t pt-2.5">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(subtotal, booking.currency)}</dd>
                </div>
                {booking.bookingFeeMinor > 0 ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Booking fee</dt>
                    <dd className="tabular-nums">
                      {formatMoney(booking.bookingFeeMinor, booking.currency)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="font-medium">Total Amount</dt>
                  <dd className="text-success font-semibold tabular-nums">
                    {formatMoney(booking.totalMinor, booking.currency)} ({booking.currency})
                  </dd>
                </div>
                {booking.payment && booking.payment.amountMinor !== booking.totalMinor ? (
                  <p className="border-warning/30 bg-warning-soft text-warning-foreground rounded-field mt-2 border px-3 py-2 text-xs">
                    {formatMoney(booking.payment.amountMinor, booking.currency)} was captured. This
                    booking has been edited since, so the amounts differ by{' '}
                    {formatMoney(
                      Math.abs(booking.totalMinor - booking.payment.amountMinor),
                      booking.currency,
                    )}
                    .
                  </p>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold">
                <Wallet className="text-primary size-5" aria-hidden />
                Payment Details
              </h2>

              {/*
                Read-only on purpose. This is the record of what the payment
                processor actually did; letting an operator type into it would
                let the system claim money was captured that never was, and
                nothing downstream — invoices, exports, the revenue figures —
                could be trusted again. Refunds go through the Payments screen,
                which asks Stripe and lets the webhook write the result back.
              */}
              {booking.payment ? (
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Method</dt>
                    <dd className="font-medium">
                      {PAYMENT_METHOD_LABELS[booking.payment.method] ?? booking.payment.method}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <StatusPill status={booking.payment.status} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd className="font-medium tabular-nums">
                      {formatMoney(booking.payment.amountMinor, booking.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Paid on</dt>
                    <dd className="font-medium">
                      {booking.payment.paidAt ? formatDateTime(booking.payment.paidAt) : 'Not yet'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Transaction</dt>
                    <dd className="break-all font-mono text-xs">
                      {booking.payment.transactionId ?? 'None recorded'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-muted-foreground rounded-field border-border border border-dashed p-5 text-center text-sm">
                  No payment has been taken for this booking yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold">
                <MessageSquare className="text-primary size-5" aria-hidden />
                Order Notes
              </h2>

              {notes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No notes added.</p>
              ) : (
                <ul className="mb-3 flex flex-col gap-2">
                  {notes.map((note, index) => (
                    <li key={index} className="rounded-field bg-muted/50 p-3 text-sm">
                      {note}
                    </li>
                  ))}
                </ul>
              )}

              {showNoteField ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Textarea
                    rows={3}
                    value={draftNote}
                    aria-label="New note"
                    placeholder="Add a note for the team…"
                    onChange={(event) => setDraftNote(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowNoteField(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={draftNote.trim().length === 0}
                      isLoading={addNote.isPending}
                      onClick={() =>
                        addNote.mutate(draftNote.trim(), {
                          onSuccess: () => {
                            setNotes([...notes, draftNote.trim()]);
                            setDraftNote('');
                            setShowNoteField(false);
                          },
                        })
                      }
                    >
                      Save note
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  block
                  className="mt-3"
                  leadingIcon={<Plus aria-hidden />}
                  onClick={() => setShowNoteField(true)}
                >
                  Add Note
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold">
                <Settings className="text-primary size-5" aria-hidden />
                Actions
              </h2>
              <div className="flex flex-col gap-2.5">
                <Button
                  variant="outline"
                  block
                  leadingIcon={<Mail aria-hidden />}
                  isLoading={sendConfirmation.isPending}
                  disabled={status === 'CANCELLED'}
                  onClick={() => sendConfirmation.mutate()}
                >
                  Send Booking Confirmation Email
                </Button>
                <Button
                  variant="outline"
                  block
                  className="border-danger text-danger hover:bg-danger-soft"
                  leadingIcon={<X aria-hidden />}
                  disabled={status === 'CANCELLED'}
                  onClick={() => setConfirmCancel(true)}
                >
                  {status === 'CANCELLED' ? 'Booking Cancelled' : 'Cancel Booking'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AddBookingItemDialog
        open={addingTour}
        onOpenChange={setAddingTour}
        reference={booking.reference}
        currency={booking.currency}
        onAdded={() => void refresh()}
      />

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title="Remove this tour from the booking?"
        description={
          pendingRemoval
            ? `${pendingRemoval.title} and its ${pendingRemoval.quantity} ticket(s) will be removed, and the seats released back to the departure.`
            : ''
        }
        confirmLabel="Remove tour"
        isPending={removeItem.isPending}
        onConfirm={() => pendingRemoval && removeItem.mutate(pendingRemoval.id)}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this booking?"
        description={`Booking ${booking.reference} will be cancelled and its seats returned to inventory. This cannot be undone.`}
        confirmLabel="Cancel booking"
        isPending={cancelBooking.isPending}
        onConfirm={() => cancelBooking.mutate()}
      />
    </div>
  );
}
