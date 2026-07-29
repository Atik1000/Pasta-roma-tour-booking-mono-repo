'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { Button, Card, CardContent, Input, Skeleton, StatusPill } from '@pasta/ui';
import { formatClockTime, formatDate, formatMoney } from '@pasta/utils';
import {
  CalendarDays,
  Clock,
  Download,
  Headphones,
  Mail,
  MapPin,
  Search,
  Users,
} from 'lucide-react';

import { isApiClientError, type TravellerBooking } from '@pasta/api-client';

import { browserApi } from '@/lib/browser-api';
import { saveBlob } from '@/lib/download';

/**
 * Find-your-bookings by email.
 *
 * Security note: the design renders another person's bookings to anyone who
 * types their address. Instead the lookup sends a signed link to that inbox,
 * and the results render only for the holder of the link. The screen is
 * otherwise unchanged, and the same "we sent it if it exists" copy is returned
 * whether or not the address is known, so this cannot enumerate customers.
 */
export function BookingLookup() {
  const params = useSearchParams();
  const token = params.get('token');

  const [email, setEmail] = React.useState('');
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [bookings, setBookings] = React.useState<TravellerBooking[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [busyReference, setBusyReference] = React.useState<string | null>(null);
  const [documentError, setDocumentError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  // Arriving from the emailed link: the token is the credential, not the address.
  React.useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setIsLoading(true);

    void browserApi.bookings
      .byToken(token)
      .then((result) => {
        if (!cancelled) setBookings(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          isApiClientError(caught) ? caught.message : 'That link is invalid or has expired.',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * Documents are fetched with the same signed token that revealed the
   * bookings, so a reference alone never yields somebody else's tickets.
   */
  async function download(reference: string, kind: 'tickets' | 'invoice') {
    if (!token) return;

    setBusyReference(reference);
    setDocumentError(null);

    try {
      const pdf =
        kind === 'tickets'
          ? await browserApi.bookings.ticketsPdf(reference, token)
          : await browserApi.bookings.invoicePdf(reference, token);

      saveBlob(pdf, `${reference}-${kind}.pdf`);
    } catch (caught: unknown) {
      setDocumentError(
        isApiClientError(caught)
          ? caught.message
          : 'That download failed. Your link may have expired — request a new one.',
      );
    } finally {
      setBusyReference(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Enter a valid email address.');
      return;
    }

    setError(undefined);
    setIsLoading(true);

    try {
      await browserApi.bookings.requestLink(value);
      setSentTo(value);
    } catch {
      setError('We could not send that link. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <span className="bg-accent text-accent-foreground hidden size-12 shrink-0 items-center justify-center rounded-full sm:flex">
                <Mail className="size-5" aria-hidden />
              </span>

              <form onSubmit={(event) => void submit(event)} className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-semibold">Find your bookings</h2>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1">
                    <label htmlFor="lookup-email" className="sr-only">
                      Email address
                    </label>
                    <Input
                      id="lookup-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Enter your email address"
                      autoComplete="email"
                      invalid={Boolean(error)}
                      aria-describedby={error ? 'lookup-error' : 'lookup-hint'}
                    />
                  </div>
                  <Button
                    type="submit"
                    isLoading={isLoading && !token}
                    leadingIcon={<Search aria-hidden />}
                  >
                    Find Bookings
                  </Button>
                </div>

                {error ? (
                  <p id="lookup-error" role="alert" className="text-danger mt-2 text-xs">
                    {error}
                  </p>
                ) : (
                  <p id="lookup-hint" className="text-muted-foreground mt-2 text-sm">
                    We&apos;ll email a secure link to view all bookings made with this address.
                  </p>
                )}
              </form>
            </div>
          </CardContent>
        </Card>

        {sentTo ? (
          <p
            role="status"
            className="rounded-card border-success/30 bg-success-soft text-success-foreground border px-4 py-3 text-sm"
          >
            If <strong>{sentTo}</strong> has bookings with us, a secure link is on its way. It
            expires in 30 minutes.
          </p>
        ) : null}

        {isLoading && token ? (
          <div className="flex flex-col gap-5">
            {Array.from({ length: 2 }, (_, index) => (
              <Skeleton key={index} className="h-48 w-full" />
            ))}
          </div>
        ) : null}

        {bookings ? (
          <>
            <p className="text-muted-foreground text-sm">
              Showing {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
            </p>

            <ul className="flex flex-col gap-5">
              {bookings.map((booking) => (
                <li key={booking.reference}>
                  <Card>
                    {/* Booking thumbnails were struck from this screen. */}
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-muted-foreground text-xs">Booking ID</p>
                          <p className="font-display text-lg font-semibold">{booking.reference}</p>
                          <p className="text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-sm">
                            <CalendarDays className="size-4" aria-hidden />
                            {formatDate(booking.bookedAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <StatusPill status={booking.status} />
                          <StatusPill
                            status={booking.paymentStatus}
                            label={
                              booking.paymentStatus === 'PENDING' ? 'Payment Pending' : undefined
                            }
                          />
                        </div>

                        <div className="text-right">
                          <p className="text-muted-foreground text-xs">Total Amount</p>
                          <p className="font-display text-xl font-semibold">
                            {formatMoney(booking.totalMinor, booking.currency)}
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 text-sm font-medium">
                        {booking.tours.length} {booking.tours.length === 1 ? 'Tour' : 'Tours'}
                      </p>

                      <ul className="mt-2 flex flex-col gap-2">
                        {booking.tours.map((tour) => (
                          <li
                            key={`${tour.title}-${tour.date}-${tour.time}`}
                            className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm"
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="bg-primary size-1.5 rounded-full" aria-hidden />
                              {tour.title}
                            </span>
                            <span className="text-muted-foreground inline-flex items-center gap-1.5">
                              <CalendarDays className="size-4" aria-hidden />
                              {formatDate(tour.date)}
                            </span>
                            <span className="text-muted-foreground inline-flex items-center gap-1.5">
                              <Clock className="size-4" aria-hidden />
                              {formatClockTime(tour.time)}
                            </span>
                            {tour.location ? (
                              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                                <MapPin className="size-4" aria-hidden />
                                {tour.location}
                              </span>
                            ) : null}
                            <span className="text-muted-foreground inline-flex items-center gap-1.5">
                              <Users className="size-4" aria-hidden />
                              {tour.travellers} Adults
                            </span>
                          </li>
                        ))}
                      </ul>

                      {expanded === booking.reference ? (
                        <div className="border-border mt-5 border-t pt-5">
                          <h3 className="text-sm font-medium">Where to meet</h3>
                          <ul className="mt-2 flex flex-col gap-3">
                            {booking.tours.map((tour) => (
                              <li
                                key={`meet-${tour.title}-${tour.date}-${tour.time}`}
                                className="text-sm"
                              >
                                <p className="font-medium">{tour.title}</p>
                                <p className="text-muted-foreground">
                                  {tour.meetingPoint ?? tour.location}
                                  {tour.meetingPointAddress ? ` — ${tour.meetingPointAddress}` : ''}
                                </p>
                              </li>
                            ))}
                          </ul>

                          <h3 className="mt-5 text-sm font-medium">Price breakdown</h3>
                          <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                            {booking.tours.map((tour) => (
                              <div
                                key={`price-${tour.title}-${tour.date}-${tour.time}`}
                                className="flex justify-between gap-4"
                              >
                                <dt className="text-muted-foreground">
                                  {tour.title} × {tour.travellers} @{' '}
                                  {formatMoney(tour.unitPriceMinor, booking.currency)}
                                </dt>
                                <dd>{formatMoney(tour.amountMinor, booking.currency)}</dd>
                              </div>
                            ))}
                            <div className="flex justify-between gap-4">
                              <dt className="text-muted-foreground">Subtotal</dt>
                              <dd>{formatMoney(booking.subtotalMinor, booking.currency)}</dd>
                            </div>
                            {booking.bookingFeeMinor > 0 ? (
                              <div className="flex justify-between gap-4">
                                <dt className="text-muted-foreground">Booking fee</dt>
                                <dd>{formatMoney(booking.bookingFeeMinor, booking.currency)}</dd>
                              </div>
                            ) : null}
                            <div className="border-border mt-1 flex justify-between gap-4 border-t pt-2 font-semibold">
                              <dt>Total</dt>
                              <dd>{formatMoney(booking.totalMinor, booking.currency)}</dd>
                            </div>
                          </dl>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-4"
                            leadingIcon={<Download aria-hidden />}
                            disabled={busyReference === booking.reference}
                            onClick={() => void download(booking.reference, 'invoice')}
                          >
                            Download Invoice
                          </Button>
                        </div>
                      ) : null}

                      <div className="mt-5 flex flex-wrap justify-end gap-2.5">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-expanded={expanded === booking.reference}
                          onClick={() =>
                            setExpanded((current) =>
                              current === booking.reference ? null : booking.reference,
                            )
                          }
                        >
                          {expanded === booking.reference ? 'Hide Details' : 'View Details'}
                        </Button>
                        {booking.status === 'CONFIRMED' ? (
                          <Button
                            size="sm"
                            leadingIcon={<Download aria-hidden />}
                            isLoading={busyReference === booking.reference}
                            onClick={() => void download(booking.reference, 'tickets')}
                          >
                            Download Ticket
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>

            {documentError ? (
              <p
                role="alert"
                className="border-danger/30 bg-danger-soft text-danger-foreground rounded-card mt-4 border px-4 py-3 text-sm"
              >
                {documentError}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <aside>
        <Card className="sticky top-24">
          <CardContent className="flex flex-col gap-4 p-6">
            <span className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
              <Headphones className="size-5" aria-hidden />
            </span>
            <h2 className="font-display text-lg font-semibold">Need help finding your booking?</h2>
            <p className="border-border text-muted-foreground border-t pt-4 text-sm">
              Our support team is here to help you with your bookings.
            </p>
            <ul className="text-muted-foreground flex flex-col gap-2.5 text-sm">
              <li className="flex items-center gap-2.5">
                <Mail className="text-primary size-4 shrink-0" aria-hidden />
                <a href="mailto:info@pastaromatour.com" className="hover:text-primary">
                  info@pastaromatour.com
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Clock className="text-primary size-4 shrink-0" aria-hidden />
                Mon – Sun: 9:00 AM – 7:00 PM (CET)
              </li>
            </ul>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
