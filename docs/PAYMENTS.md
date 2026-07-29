# Payments

Card payment runs through Stripe. Everything is built; it needs three keys to come alive.

## Turning it on

```bash
STRIPE_SECRET_KEY=sk_test_…        # server-side. Never leaves the API
STRIPE_PUBLISHABLE_KEY=pk_test_…   # handed to the browser by the API
STRIPE_WEBHOOK_SECRET=whsec_…      # from `stripe listen`, or the dashboard endpoint
```

Test-mode keys exercise the whole flow. **Without `STRIPE_SECRET_KEY` the payment routes answer `503` and everything else runs normally** — that is the state development and CI run in, and it is covered by tests.

For local development, forward Stripe's events to the API and use the secret it prints:

```bash
stripe listen --forward-to localhost:4000/api/v1/payments/webhook
stripe trigger payment_intent.succeeded
```

In production, add an endpoint in the Stripe dashboard pointing at `https://<api-host>/api/v1/payments/webhook` and subscribe it to:

| Event                           | What it does here                                                   |
| ------------------------------- | ------------------------------------------------------------------- |
| `payment_intent.succeeded`      | Confirms the booking, clears the expiry, emails the tickets         |
| `payment_intent.payment_failed` | Records the decline; the booking stays pending so it can be retried |
| `charge.refunded`               | Mirrors a refund — including one made in the Stripe dashboard       |

## The flow

```
checkout  →  booking created (PENDING, seats held 30 min)
          →  POST /checkout/:reference/payment-intent   → clientSecret
          →  browser confirms with Stripe directly       ← card details stop here
          →  Stripe → POST /payments/webhook (signed)    → booking CONFIRMED, tickets emailed
          →  /booking-confirmed polls GET /checkout/:reference/status
```

### Why the webhook, and only the webhook, confirms a booking

A browser redirect can be lost, replayed or forged. A signed webhook cannot. So the browser never tells this API that a payment succeeded — it hands off to the confirmation page, which asks the API what it believes. The gap between the two is real and usually a second or two; the page says "Confirming your payment…" during it rather than guessing.

### Card details never reach this server

Stripe Elements exchanges them for a token inside an iframe served by Stripe. Nothing card-shaped is posted to the API, which keeps the deployment out of PCI scope. Do not add a field that accepts a card number.

## Idempotency

Stripe retries webhooks, and travellers double-click.

| Risk                                  | Guard                                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Two intents for one booking           | `idempotencyKey: booking-intent-<id>`, plus reuse of any unfinished intent                                           |
| A replayed `succeeded` event          | The update is conditional on the payment not already being `PAID`; a replay writes nothing and sends no second email |
| A late `payment_failed` after capture | Ignored when the payment is already `PAID`                                                                           |
| A retried refund                      | `idempotencyKey` covering the payment, its refunded total and the amount                                             |
| Two payment rows for one intent       | `Payment.providerIntentId` is unique at the database level                                                           |

An intent whose booking was edited afterwards is **updated**, not reused as-is — otherwise an admin adding a tour would leave the traveller paying the old, lower amount.

## Refunds

`POST /admin/payments/:id/refund`, ADMIN only — an editor manages content, not money. Omit `amountMinor` to refund whatever is still refundable.

The endpoint calls Stripe and then **stops**. The local record is written by the resulting `charge.refunded` webhook, so a refund issued here and one issued from the Stripe dashboard travel exactly the same path and cannot disagree. A partial refund leaves the payment `PAID` with a non-zero `refundedAmount`; only a full refund becomes `REFUNDED`.

## What is not built

- **Wallets and redirect methods** (Apple Pay, iDEAL, Klarna). `payment_method_types` is `['card']` on purpose: redirect methods return to a URL this application does not yet handle, which would strand travellers mid-payment.
- **Automatic cancellation on refund.** A refund does not cancel the booking or release seats — that is an operator's decision, and cancelling is already one click away.
- **Multi-currency capture.** Bookings are priced in EUR or USD and charged in that currency; there is no conversion.

## Testing without a Stripe account

`apps/api/src/modules/payments/payments.service.spec.ts` stubs the Stripe client, so every rule above — reuse, replay safety, refund arithmetic, signature rejection — is verified in CI with no credentials. `apps/api/test/payments.e2e-spec.ts` covers the unconfigured environment: routes reachable, authorisation enforced, `503` rather than `500`.

Stripe's test cards once keys are in place:

| Number                | Result                        |
| --------------------- | ----------------------------- |
| `4242 4242 4242 4242` | Succeeds                      |
| `4000 0000 0000 9995` | Declined — insufficient funds |
| `4000 0025 0000 3155` | Requires 3-D Secure           |
