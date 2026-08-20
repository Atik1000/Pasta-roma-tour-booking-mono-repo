'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import Link from 'next/link';

import { Button, Card, CardContent, Input, Skeleton, StatusPill, Thumbnail } from '@pasta/ui';
import { formatDate, formatMoney } from '@pasta/utils';
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
  const linkToken = params.get('token');

  const [email, setEmail] = React.useState('');
  /**
   * Kept in state rather than read from the URL, because there are now two
   * ways to arrive at a booking: an emailed link carries its token in the
   * query string, while a direct lookup is handed one in the response. The
   * downloads need a token either way.
   */
  const [token, setToken] = React.useState<string | null>(linkToken);
  const [searchedFor, setSearchedFor] = React.useState<string | null>(null);
  // Declared with the rest of the state because `submit` sets it: leaving it
  // below the handler put it in the temporal dead zone for anyone reading top
  // to bottom, even though it resolves by the time a click can happen.
  const [showLookup, setShowLookup] = React.useState(false);
  const [bookings, setBookings] = React.useState<TravellerBooking[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [busyReference, setBusyReference] = React.useState<string | null>(null);
  const [documentError, setDocumentError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  // Arriving from the emailed link: the token is the credential, not the address.
  React.useEffect(() => {
    if (!linkToken) return;

    let cancelled = false;
    setIsLoading(true);

    void browserApi.bookings
      .byToken(linkToken)
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
  }, [linkToken]);

  /**
   * The invoice is fetched with the same signed token that revealed the
   * bookings, so a reference alone never yields somebody else's paperwork.
   *
   * Tickets are not offered here — they travel with the confirmation email.
   */
  async function downloadInvoice(reference: string) {
    if (!token) return;

    setBusyReference(reference);
    setDocumentError(null);

    try {
      const pdf = await browserApi.bookings.invoicePdf(reference, token);
      saveBlob(pdf, `${reference}-invoice.pdf`);
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
      const result = await browserApi.bookings.lookup(value);

      setBookings(result.bookings);
      setToken(result.token);
      setSearchedFor(value);
      // Collapse the search box only when there is something to show behind it.
      setShowLookup(result.bookings.length === 0);
    } catch (caught: unknown) {
      // The endpoint is rate limited, and "try again" is unhelpful advice when
      // the answer is "wait" — so the server's own message is preferred.
      setError(
        isApiClientError(caught) ? caught.message : 'We could not look that up. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Once the link has done its job the search box is no longer the point of the
  // screen — the bookings are. It collapses to a one-line "search a different
  // address" rather than sitting above the results taking the eye first.
  const hasResults = bookings !== null && bookings.length > 0;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {hasResults && !showLookup ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Showing {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setShowLookup(true)}>
              <Search aria-hidden />
              Search another address
            </Button>
          </div>
        ) : null}

        <Card className={hasResults && !showLookup ? 'hidden' : undefined}>
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
                    isLoading={isLoading && !linkToken}
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
                    Every booking made with this address — confirmed, pending and cancelled.
                  </p>
                )}
              </form>
            </div>
          </CardContent>
        </Card>

        {/*
          An address with nothing behind it is the one case the results list
          cannot speak for, and "0 bookings" alone reads like a failure. Naming
          the address searched makes the usual cause — a typo, or the other
          address they booked with — the obvious next thing to try.
        */}
        {searchedFor && bookings?.length === 0 ? (
          <p
            role="status"
            className="rounded-card border-border bg-muted text-muted-foreground border px-4 py-3 text-sm"
          >
            No bookings found for <strong>{searchedFor}</strong>. Check the spelling, or try the
            address you used when you booked.
          </p>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-5">
            {Array.from({ length: 2 }, (_, index) => (
              <Skeleton key={index} className="h-48 w-full" />
            ))}
          </div>
        ) : null}

        {bookings ? (
          <>
            {showLookup || bookings.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Showing {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
              </p>
            ) : null}

            <ul className="flex flex-col gap-5">
              {bookings.map((booking) => (
                <li key={booking.reference}>
                  <Card className="overflow-hidden">
                    {/*
                      A tinted header band carries the reference, the statuses
                      and the total, so the three things a traveller checks
                      first are read in one glance rather than picked out of a
                      flat card.
                    */}
                    <div className="bg-cream-100 border-border flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-xs">Booking ID</p>
                        <p className="font-display text-lg font-semibold">{booking.reference}</p>
                        <p className="text-muted-foreground mt-0.5 inline-flex items-center gap-1.5 text-xs">
                          <CalendarDays className="size-3.5" aria-hidden />
                          Booked {formatDate(booking.bookedAt)}
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

                      <div className="ml-auto text-right">
                        <p className="text-muted-foreground text-xs">Total Amount</p>
                        <p className="font-display text-primary text-xl font-semibold">
                          {formatMoney(booking.totalMinor, booking.currency)}
                        </p>
                      </div>
                    </div>

                    <CardContent className="p-5">
                      {/*
                        One row per tour, led by its photograph. Thumbnails were
                        struck from this screen originally; they earn their place
                        now that the tours carry real cover images, because a
                        picture is how someone recognises which trip this was.
                      */}
                      <ul className="flex flex-col gap-4">
                        {booking.tours.map((tour) => (
                          <li key={tour.slug} className="flex items-start gap-4">
                            <Thumbnail
                              src={tour.coverImage}
                              alt=""
                              className="h-16 w-24 sm:h-20 sm:w-28"
                            />

                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/tours/${tour.slug}`}
                                className="hover:text-primary font-medium transition-colors"
                              >
                                {tour.title}
                              </Link>

                              <ul className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                {tour.location ? (
                                  <li className="inline-flex items-center gap-1.5">
                                    <MapPin className="size-4 shrink-0" aria-hidden />
                                    {tour.location}
                                  </li>
                                ) : null}
                                <li className="inline-flex items-center gap-1.5">
                                  <Users className="size-4 shrink-0" aria-hidden />
                                  {tour.travellers} {tour.travellers === 1 ? 'Adult' : 'Adults'}
                                </li>
                              </ul>
                            </div>

                            <span className="hidden shrink-0 text-sm font-medium tabular-nums sm:block">
                              {formatMoney(tour.amountMinor, booking.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {expanded === booking.reference ? (
                        <div className="border-border mt-5 border-t pt-5">
                          <h3 className="text-sm font-medium">Where to meet</h3>
                          <ul className="mt-2 flex flex-col gap-3">
                            {booking.tours.map((tour) => (
                              <li key={`meet-${tour.slug}`} className="text-sm">
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
                                key={`price-${tour.slug}`}
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
                            onClick={() => void downloadInvoice(booking.reference)}
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

      {/* Sticky as a whole column, and `self-start` so the grid row's height
          does not pin it in place — the same fix the cart needed. */}
      <aside className="xl:sticky xl:top-24 xl:self-start">
        <Card>
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
