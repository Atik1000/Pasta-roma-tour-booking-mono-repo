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
  Pencil,
  Plus,
  Printer,
  Settings,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';

import type { AdminBookingDetail } from '@pasta/api-client';

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

  const [items, setItems] = React.useState(booking.items);

  const subtotal = items.reduce((sum, item) => sum + item.amountMinor, 0);
  const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col gap-6">
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

        <Button variant="outline" leadingIcon={<Printer aria-hidden />}>
          Print Invoice
        </Button>
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
                  {formatMoney(subtotal, booking.currency)} ({booking.currency})
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
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button size="sm">Save Changes</Button>
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
                  {formatMoney(subtotal, booking.currency)} ({booking.currency})
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
                <Button variant="outline" size="sm" leadingIcon={<Plus aria-hidden />}>
                  Add Tour
                </Button>
              </div>

              <div className="flex flex-col gap-5">
                {items.map((item, itemIndex) => (
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
                        <Button variant="subtle" size="icon" aria-label={`Edit ${item.title}`}>
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          variant="subtle"
                          size="icon"
                          aria-label={`Remove ${item.title}`}
                          className="text-danger hover:bg-danger-soft"
                          onClick={() => setItems(items.filter((_, i) => i !== itemIndex))}
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
                              #
                            </th>
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
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-4 py-3">1</td>
                            <td className="px-4 py-3">
                              {/* Adults only — child tickets were removed from the product. */}
                              <Select defaultValue="ADULT">
                                <SelectTrigger className="h-9 w-36" aria-label="Ticket type">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ADULT">Adult ({booking.currency})</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                className="h-9 w-28"
                                aria-label="Unit price"
                                defaultValue={(item.unitPriceMinor / 100).toFixed(2)}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                className="h-9 w-20"
                                type="number"
                                min="1"
                                aria-label="Quantity"
                                defaultValue={item.quantity}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <ul className="flex flex-col gap-1">
                                {item.holders.map((holder) => (
                                  <li key={holder} className="flex items-center gap-2">
                                    <span
                                      className="bg-primary size-1.5 rounded-full"
                                      aria-hidden
                                    />
                                    {holder}
                                  </li>
                                ))}
                              </ul>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-danger hover:bg-danger-soft size-8"
                                aria-label={`Delete ticket row for ${item.title}`}
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="border-border flex justify-end border-t p-3">
                      <Button variant="outline" size="sm" leadingIcon={<Plus aria-hidden />}>
                        Add Ticket
                      </Button>
                    </div>
                  </div>
                ))}
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
                <div className="flex justify-between gap-4">
                  <dt className="font-medium">Total Amount</dt>
                  <dd className="text-success font-semibold tabular-nums">
                    {formatMoney(subtotal, booking.currency)} ({booking.currency})
                  </dd>
                </div>
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

              <div className="flex flex-col gap-4">
                <FormField label="Payment Method">
                  <Select defaultValue={booking.payment?.method ?? 'CARD'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CARD">Credit Card</SelectItem>
                      <SelectItem value="PAYPAL">PayPal</SelectItem>
                      <SelectItem value="APPLE_PAY">Apple Pay</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Transaction ID">
                  <Input defaultValue={booking.payment?.transactionId ?? ''} />
                </FormField>

                <FormField label="Paid Amount">
                  <Input
                    defaultValue={(
                      (booking.payment?.amountMinor ?? booking.totalMinor) / 100
                    ).toFixed(2)}
                  />
                </FormField>

                <FormField label="Payment Date">
                  <Input
                    type="datetime-local"
                    defaultValue={booking.payment?.paidAt?.slice(0, 16) ?? ''}
                  />
                </FormField>

                <div className="flex justify-end gap-2.5">
                  <Button variant="ghost" size="sm">
                    Cancel
                  </Button>
                  <Button size="sm">Save Changes</Button>
                </div>
              </div>
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
                      onClick={() => {
                        setNotes([...notes, draftNote.trim()]);
                        setDraftNote('');
                        setShowNoteField(false);
                      }}
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
                <Button variant="outline" block leadingIcon={<Mail aria-hidden />}>
                  Send Booking Confirmation Email
                </Button>
                <Button
                  variant="outline"
                  block
                  className="border-danger text-danger hover:bg-danger-soft"
                  leadingIcon={<X aria-hidden />}
                >
                  Cancel Booking
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
