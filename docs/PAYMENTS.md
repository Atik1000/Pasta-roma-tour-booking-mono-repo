# Payments

Card payment runs through **Revolut** or **Stripe**. Both are wired at once; `PAYMENT_PROVIDER` decides which one opens new payments.

## Two gateways, one ledger

Two rules, and they are deliberately different:

- A **new** payment goes to the configured provider. That is a deployment decision — change `PAYMENT_PROVIDER`, restart, done. No rebuild of the front-end: the browser is told which gateway to mount by the API, not by the build.
- An **existing** payment stays with the gateway holding the money. Refunds route by the payment's own `provider` column, never by configuration. Switching providers on Monday must not make Sunday's takings unrefundable, and asking Revolut to refund a Stripe charge is not a graceful failure — it is a 404 in front of a customer who is owed money.

Everything the two have in common — which bookings may be charged, what a capture does to a booking, replay safety, when tickets go out — lives once in `PaymentLedgerService`. A second copy of "mark the booking paid" is a second place to forget the expiry sweeper.

```
apps/api/src/modules/payments/
├── payments.service.ts          the façade: routes new payments and refunds
├── payment-ledger.service.ts    the booking-side rules, shared by both
├── payment-intent.types.ts      the discriminated union the browser receives
├── stripe/                      stripe-payments.service.ts, stripe.provider.ts
└── revolut/                     revolut-payments.service.ts, revolut.client.ts,
                                 revolut-signature.ts
```

## Turning it on

```bash
PAYMENT_PROVIDER=revolut           # revolut | stripe — where NEW payments go

# Revolut
REVOLUT_API_URL=https://sandbox-merchant.revolut.com   # merchant.revolut.com when live
REVOLUT_SECRET_KEY=sk_…            # server-side only. Never leaves the API
REVOLUT_PUBLIC_KEY=pk_…            # handed to the browser by the API
REVOLUT_WEBHOOK_SECRET=wsk_…       # from the webhook you register (comma-separate to rotate)

# Stripe
STRIPE_SECRET_KEY=sk_test_…
STRIPE_PUBLISHABLE_KEY=pk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
```

**With no secret key for the selected provider the payment routes answer `503` and everything else runs normally.** That is the state development and CI run in, and it is covered by tests. Sandbox keys exercise the whole flow.

`REVOLUT_API_URL` also decides which Revolut the _widget_ talks to — the environment is derived from the host rather than configured separately, because the two must agree and a token minted in sandbox is meaningless to production.

---

## Revolut

Reference: [Merchant API](https://developer.revolut.com/docs/merchant/merchant-api). Pinned to API version **`2024-09-01`**, the one in which the public order identifier became `token`. Revolut ships breaking changes behind dated versions; leaving it unset would let a change on their side alter this application's behaviour with no deploy.

### Setup

1. Revolut **Business** account with the Merchant API enabled.
2. Merchant API → API keys. Take the **secret** and **public** keys — sandbox first.
3. Register a webhook pointing at `https://<api-host>/api/v1/payments/webhook/revolut`, subscribed to the events below. Keep the signing secret it returns.

The webhook URL must be publicly reachable, so `localhost` will not do. For local work, tunnel it:

```bash
cloudflared tunnel --url http://localhost:4000     # or: ngrok http 4000
# register https://<tunnel-host>/api/v1/payments/webhook/revolut
```

### Events

| Event                                             | What it does here                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `ORDER_COMPLETED`                                 | Reads the order back, then confirms the booking and emails the tickets |
| `ORDER_AUTHORISED`                                | Same path — applied only if the read-back says `completed`             |
| `ORDER_PAYMENT_FAILED` / `ORDER_PAYMENT_DECLINED` | Records the decline; the booking stays pending so it can be retried    |
| `ORDER_CANCELLED`                                 | Records the cancellation against the payment                           |
| `REFUND_COMPLETED`                                | Folds the refund into the original order's payment, once               |

Anything else is acknowledged and ignored — returning an error would make Revolut retry an event this application has no opinion about.

### Signature verification

The signature **is** the authentication for that endpoint. Without it, anyone who learns the URL can post `{"event":"ORDER_COMPLETED","order_id":"…"}` and mark a booking paid, so it is checked before the payload is parsed and before a single row is read.

| Step       | Rule                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------- |
| Payload    | `<version>.<timestamp>.<raw body>` — the exact bytes sent, not a re-serialised object         |
| Algorithm  | HMAC-SHA256 with the signing secret, hex-encoded                                              |
| Headers    | `Revolut-Signature` (may carry several entries), `Revolut-Request-Timestamp`                  |
| Freshness  | 5-minute tolerance, and a future timestamp is rejected too                                    |
| Comparison | Constant-time, after a length check                                                           |
| Rotation   | `REVOLUT_WEBHOOK_SECRET` accepts a comma-separated list; any secret matching any entry passes |

Rejecting a stale timestamp is what stops a captured payload being replayed forever.

### A webhook is a trigger, not proof

This is Revolut's own guidance and it is worth stating plainly: the event carries an order id and nothing else worth trusting. Every completion event therefore causes the order to be **read back over the API**, and the booking is only confirmed when Revolut itself reports:

- `state` is `completed`, **and**
- `amount` and `currency` match what the booking is owed.

A completed order for the wrong figure is not a paid booking. If the read-back fails, nothing is applied and the event is left for Revolut to retry — confirming a booking on an event this server could not corroborate is exactly the failure the read-back exists to prevent.

---

## Stripe

For local development, forward Stripe's events and use the secret it prints:

```bash
stripe listen --forward-to localhost:4000/api/v1/payments/webhook
stripe trigger payment_intent.succeeded
```

In production, add an endpoint in the Stripe dashboard at `https://<api-host>/api/v1/payments/webhook` — the original path, deliberately unchanged so an existing configuration does not have to be touched when Revolut is switched on beside it.

| Event                           | What it does here                                                   |
| ------------------------------- | ------------------------------------------------------------------- |
| `payment_intent.succeeded`      | Confirms the booking, clears the expiry, emails the tickets         |
| `payment_intent.payment_failed` | Records the decline; the booking stays pending so it can be retried |
| `charge.refunded`               | Mirrors a refund — including one made in the Stripe dashboard       |

Each gateway has its **own** endpoint rather than one that sniffs them apart by header. The signature scheme is the authentication, and a single endpoint guessing which one to apply is one bad guess away from accepting an unsigned payload.

---

## The flow

```
checkout  →  booking created (PENDING, seats held 30 min)
          →  POST /checkout/:reference/payment-intent
                 revolut → { provider, token, publicKey, environment, amountMinor, currency }
                 stripe  → { provider, clientSecret, publishableKey, amountMinor, currency }
          →  browser pays the gateway directly            ← card details stop here
          →  gateway → POST /payments/webhook[/revolut]   → booking CONFIRMED, tickets emailed
          →  /booking-confirmed polls GET /checkout/:reference/status
```

The intent response is a **discriminated union** on `provider`. The two gateways genuinely need different things in the browser — Stripe mounts Elements against a client secret, Revolut mounts its pop-up against an order token — and flattening them into one optional-everything object would only move the branch out of the type system and into a runtime guess.

### Why the webhook, and only the webhook, confirms a booking

A browser redirect can be lost, replayed or forged. A signed webhook cannot. So the browser never tells this API that a payment succeeded — it hands off to the confirmation page, which asks the API what it believes. The gap is real and usually a second or two; the page says "Confirming your payment…" during it rather than guessing.

### Card details never reach this server

Both gateways exchange them for a token inside an iframe they serve themselves. Nothing card-shaped is posted to the API, which keeps the deployment out of PCI scope. **Do not add a field that accepts a card number.**

---

## Idempotency and replay safety

Both gateways retry webhooks, and travellers double-click.

| Risk                                | Guard                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Two payments open for one booking   | Stripe: `idempotencyKey: booking-intent-<id>`. Revolut: the stored order is retrieved and reused while `pending` or `processing` |
| A replayed capture event            | The update is conditional on the payment not already being `PAID`; a replay writes nothing and sends no second email             |
| A late failure after capture        | Ignored when the payment is already `PAID`                                                                                       |
| A retried refund call               | Stripe: `idempotencyKey` covering the payment, its refunded total and the amount                                                 |
| A replayed `REFUND_COMPLETED`       | `Payment.appliedRefundIds` records each refund order already folded in; a second sighting is a no-op                             |
| Two payment rows for one gateway id | `Payment.providerIntentId` is unique at the database level                                                                       |
| A stale gateway id after a switch   | Reuse requires the stored `provider` to match; a Stripe intent id is never handed to Revolut, or the reverse                     |

A payment whose booking was edited afterwards is **repriced**, not reused as-is — Stripe by updating the intent, Revolut by `PATCH`ing the order. Otherwise an admin adding a tour would leave the traveller paying the old, lower amount, or paying into an order the API had stopped listening for.

Revolut needs one extra guard Stripe does not: Stripe reports a cumulative `amount_refunded`, so it can simply be stored, while Revolut raises a separate refund _order_ per refund and reports only its amount. A running total only exists if this side keeps one — hence `appliedRefundIds`, without which a replayed webhook would refund the customer twice on paper.

---

## Refunds

`POST /admin/payments/:id/refund`, **ADMIN only** — an editor manages content, not money. Omit `amountMinor` to refund whatever is still refundable.

The endpoint calls the gateway and then **stops**. The local record is written by the resulting webhook (`charge.refunded` / `REFUND_COMPLETED`), so a refund issued here and one issued from the gateway's own dashboard travel exactly the same path and cannot disagree.

A partial refund leaves the payment `PAID` with a non-zero `refundedAmount`; only a full refund becomes `REFUNDED`.

Only the provider is read before routing. Whether the payment may actually be refunded is the chosen gateway's own first question, asked after it has checked it is configured at all — so an unconfigured environment answers "not configured" rather than a verdict about the payment, which would be a lie.

---

## Database

Migration `20260809120000_add_payment_provider` adds two columns to `payments`:

| Column             | Why                                                                               |
| ------------------ | --------------------------------------------------------------------------------- |
| `provider`         | `STRIPE` \| `REVOLUT`. Existing rows backfill to `STRIPE`, which is what they are |
| `appliedRefundIds` | Refund ids already folded into `refundedAmount`, so Revolut replays are harmless  |

Run `pnpm --filter @pasta/api db:deploy` on each environment **before** the new code starts.

The admin panel shows the gateway under the method on the Payments table, and as **Processed By** on the booking's payment panel. With two card gateways live at once, "Card" no longer says where the money is — and an operator chasing a refund needs to know which dashboard to open.

---

## Switching providers

```bash
PAYMENT_PROVIDER=stripe   # or revolut
```

Restart the API. That is the whole change. Bookings part way through a payment on the old provider start again on the new one — their stored gateway id is recognised as belonging elsewhere and ignored, rather than handed to a gateway that has never heard of it.

Reverting is the same one line, which is why Stripe is kept wired rather than deleted.

---

## What is not built

- **Wallets and redirect methods** (Apple Pay, Google Pay, Revolut Pay, Pay by Bank, iDEAL, Klarna). Stripe is `payment_method_types: ['card']` and Revolut uses the card pop-up. Redirect methods return to a URL this application does not yet handle, which would strand travellers mid-payment.
- **Manual capture.** Revolut orders use `capture_mode: 'automatic'` — the seats are committed when the booking is made, so there is nothing to authorise now and capture later.
- **Automatic cancellation on refund.** A refund does not cancel the booking or release seats — that is an operator's decision, and cancelling is already one click away.
- **Multi-currency capture.** Bookings are priced in EUR or USD and charged in that currency; there is no conversion. Confirm the merchant account settles in both before going live.
- **Webhook registration from code.** Both webhooks are created by hand in the respective dashboard.

---

## Testing without an account

Every rule above is verified in CI with no credentials:

| File                                                | Covers                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `payments/stripe/stripe-payments.service.spec.ts`   | Intent reuse, replay safety, refund arithmetic, signature rejection                         |
| `payments/revolut/revolut-payments.service.spec.ts` | Order reuse and repricing, read-back before confirming, amount mismatch, refund idempotency |
| `payments/revolut/revolut-signature.spec.ts`        | Forged signatures, tampered bodies, stale and future timestamps, secret rotation            |
| `test/payments.e2e-spec.ts`                         | The unconfigured environment: routes reachable, authorisation enforced, `503` not `500`     |

```bash
pnpm --filter @pasta/api test
```

Once keys are in place, Stripe's test cards:

| Number                | Result                        |
| --------------------- | ----------------------------- |
| `4242 4242 4242 4242` | Succeeds                      |
| `4000 0000 0000 9995` | Declined — insufficient funds |
| `4000 0025 0000 3155` | Requires 3-D Secure           |

For Revolut, use the sandbox cards from [Simulate payments](https://developer.revolut.com/docs/guides/merchant/test-and-go-live/testing/simulate-payments) — they are account-specific and are not reproduced here.
