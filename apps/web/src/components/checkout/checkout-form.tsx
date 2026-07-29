'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { isApiClientError, type Cart, type TicketHolder } from '@pasta/api-client';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  FormField,
  Input,
  PriceBreakdown,
  Skeleton,
} from '@pasta/ui';
import { formatClockTime, formatDate, formatMoney } from '@pasta/utils';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react';

import { browserApi } from '@/lib/browser-api';
import { clearCartCount, syncCartCount } from '@/lib/cart-store';

const PAYMENT_MARKS = ['VISA', 'MC', 'AMEX', 'PayPal', 'Pay'];

/**
 * Checkout: billing details, one name pair per ticket, and the order summary.
 * Guest-only by design — there are no customer accounts.
 *
 * Every ticket is an adult ticket; child pricing was removed from the product.
 * Server-side field errors are mapped back onto the inputs that produced them.
 */
export function CheckoutForm() {
  const router = useRouter();
  const [cart, setCart] = React.useState<Cart | null>(null);
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [holders, setHolders] = React.useState<Record<string, TicketHolder[]>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let cancelled = false;

    void browserApi.cart
      .get()
      .then((result) => {
        if (cancelled) return;
        setCart(result);
        setHolders(
          Object.fromEntries(
            result.items.map((item) => [
              item.id,
              Array.from({ length: item.quantity }, () => ({ firstName: '', lastName: '' })),
            ]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setCart(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const holdersComplete = (cart?.items ?? []).every((item) =>
    (holders[item.id] ?? []).every((holder) => holder.firstName.trim() && holder.lastName.trim()),
  );

  function updateHolder(itemId: string, index: number, patch: Partial<TicketHolder>) {
    setHolders((current) => {
      const next = [...(current[itemId] ?? [])];
      next[index] = { ...(next[index] ?? { firstName: '', lastName: '' }), ...patch };
      return { ...current, [itemId]: next };
    });
  }

  async function removeItem(itemId: string) {
    const updated = await browserApi.cart.remove(itemId);
    syncCartCount(updated);
    setCart(updated);
    setHolders((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setFieldErrors({});

    if (!cart || !fullName.trim() || !emailValid || !holdersComplete) return;

    setIsSubmitting(true);

    try {
      // Holder order must match cart order — that is how the API pairs names to tickets.
      const ticketHolders = cart.items.flatMap((item) => holders[item.id] ?? []);
      const result = await browserApi.checkout.create({ fullName, email, ticketHolders });
      // The server empties the cart once the booking exists.
      clearCartCount();
      // The booking exists and holds its seats; payment is the next step.
      router.push(`/checkout/pay?reference=${encodeURIComponent(result.reference)}`);
    } catch (caught) {
      if (isApiClientError(caught)) {
        setFormError(caught.message);
        setFieldErrors(caught.fieldErrors);
        // A sold-out slot invalidates the cart we are showing.
        const refreshed = await browserApi.cart.get().catch(() => cart);
        setCart(refreshed);
        syncCartCount(refreshed);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setIsSubmitting(false);
    }
  }

  if (!cart) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Your cart is empty"
          description="Add a tour before checking out."
          action={
            <Button asChild>
              <Link href="/tours">Explore tours</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-6">
        {formError ? (
          <p
            role="alert"
            className="border-danger/30 bg-danger-soft text-danger-foreground rounded-card flex items-start gap-2.5 border px-4 py-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </p>
        ) : null}

        <Card>
          <CardContent className="p-6">
            <h2 className="font-display mb-5 text-lg font-semibold">A. Billing Details</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                label="Full Name"
                required
                error={
                  fieldErrors.fullName ??
                  (submitted && !fullName.trim() ? 'Enter your full name.' : undefined)
                }
              >
                <Input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Enter your full name"
                  autoComplete="name"
                  leadingIcon={<User aria-hidden />}
                />
              </FormField>

              <FormField
                label="Email Address"
                required
                hint="Your tickets and confirmation are sent here."
                error={
                  fieldErrors.email ??
                  (submitted && !emailValid ? 'Enter a valid email address.' : undefined)
                }
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email address"
                  autoComplete="email"
                  leadingIcon={<Mail aria-hidden />}
                />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="font-display mb-5 text-lg font-semibold">
              B. Cart Tours &amp; Ticket Holder Details
            </h2>

            <div className="flex flex-col gap-5">
              {cart.items.map((item) => (
                <div key={item.id} className="rounded-card border-border border">
                  <div className="flex flex-wrap items-start gap-4 p-4">
                    <div
                      role="img"
                      aria-label={item.title}
                      className="rounded-field h-16 w-24 shrink-0 bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display font-semibold">{item.title}</h3>
                      <ul className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <li className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-4" aria-hidden />
                          {formatDate(item.date)}
                        </li>
                        <li className="inline-flex items-center gap-1.5">
                          <Clock className="size-4" aria-hidden />
                          {formatClockTime(item.time)}
                        </li>
                        <li className="inline-flex items-center gap-1.5">
                          <MapPin className="size-4" aria-hidden />
                          {item.location}
                        </li>
                      </ul>
                      <p className="text-muted-foreground mt-1.5 inline-flex items-center gap-1.5 text-sm">
                        <Users className="size-4" aria-hidden />
                        {item.quantity} Adult {item.quantity === 1 ? 'Ticket' : 'Tickets'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-primary text-xl font-semibold">
                        {formatMoney(item.amountMinor, item.currency)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void removeItem(item.id)}
                        className="text-danger mt-1 inline-flex items-center gap-1.5 text-sm hover:underline"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="border-border bg-muted/30 flex flex-col gap-4 border-t p-4">
                    {Array.from({ length: item.quantity }, (_, index) => {
                      const holder = holders[item.id]?.[index];
                      const missing =
                        submitted && (!holder?.firstName.trim() || !holder?.lastName.trim());

                      return (
                        <div
                          key={index}
                          className="grid items-start gap-4 sm:grid-cols-[8rem_1fr_1fr]"
                        >
                          <p className="flex items-center gap-2 pt-8 text-sm font-medium">
                            <span className="bg-brand-gradient text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs">
                              {index + 1}
                            </span>
                            Ticket {index + 1} — Adult
                          </p>

                          <FormField label="First Name" error={missing ? 'Required' : undefined}>
                            <Input
                              value={holder?.firstName ?? ''}
                              onChange={(event) =>
                                updateHolder(item.id, index, { firstName: event.target.value })
                              }
                              placeholder="First name"
                              autoComplete="off"
                              leadingIcon={<User aria-hidden />}
                            />
                          </FormField>

                          <FormField label="Last Name" error={missing ? 'Required' : undefined}>
                            <Input
                              value={holder?.lastName ?? ''}
                              onChange={(event) =>
                                updateHolder(item.id, index, { lastName: event.target.value })
                              }
                              placeholder="Last name"
                              autoComplete="off"
                              leadingIcon={<User aria-hidden />}
                            />
                          </FormField>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <aside>
        <Card className="sticky top-24">
          <CardContent className="flex flex-col gap-5 p-6">
            <h2 className="font-display text-lg font-semibold">C. Order Summary</h2>

            <ul className="flex flex-col gap-4">
              {cart.items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <div
                    role="img"
                    aria-label={item.title}
                    className="rounded-field h-12 w-16 shrink-0 bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(item.date)} • {formatClockTime(item.time)} • {item.location}
                    </p>
                    <p className="mt-1 flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.quantity} Adult {item.quantity === 1 ? 'Ticket' : 'Tickets'}
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(item.amountMinor, item.currency)}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-border border-t pt-4">
              <PriceBreakdown
                currency={cart.currency}
                lines={[
                  { label: 'Subtotal', amountMinor: cart.subtotalMinor },
                  { label: 'Booking Fee', amountMinor: cart.bookingFeeMinor, muted: true },
                ]}
                totalMinor={cart.totalMinor}
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <Button
                type="submit"
                size="lg"
                block
                isLoading={isSubmitting}
                leadingIcon={<Lock aria-hidden />}
              >
                Proceed to Payment
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                block
                asChild
                leadingIcon={<ArrowLeft aria-hidden />}
              >
                <Link href="/tours">Continue Shopping</Link>
              </Button>
            </div>

            {submitted && !isSubmitting && (!fullName.trim() || !emailValid || !holdersComplete) ? (
              <p role="alert" className="text-danger text-center text-xs">
                Complete the highlighted fields before continuing to payment.
              </p>
            ) : null}

            <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
              <ShieldCheck className="text-success size-4" aria-hidden />
              Secure checkout. Your data is protected.
            </p>

            <ul className="flex items-center justify-center gap-2">
              {PAYMENT_MARKS.map((mark) => (
                <li
                  key={mark}
                  className="border-border text-muted-foreground flex h-8 w-12 items-center justify-center rounded-[0.375rem] border text-[0.5rem] font-bold"
                >
                  {mark}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
