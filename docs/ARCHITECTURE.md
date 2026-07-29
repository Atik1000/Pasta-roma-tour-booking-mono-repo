# Architecture

## Shape of the repo

```
apps/
  web/      Next.js 15 · public website          (port 3000)
  admin/    Next.js 15 · admin panel             (port 3001)
  api/      NestJS 11 · REST API                 (port 4000)

packages/
  config/       tsconfig presets, ESLint flat configs, Tailwind theme
  types/        domain enums, envelopes, primitives      → tsup (ESM + CJS + d.ts)
  utils/        money, dates, strings, pagination        → tsup (ESM + CJS + d.ts)
  api-client/   axios transport, auth refresh, SDK       → tsup (ESM + CJS + d.ts)
  ui/           design-system components                 → TS source, transpiled by apps
  hooks/        shared React hooks                       → TS source, transpiled by apps

docker/            container definitions (Phase 11)
.github/workflows/ CI (Phase 2) and deployment (Phase 11)
```

## Dependency direction

```
        ┌──────────┐        ┌──────────┐
        │   web    │        │  admin   │
        └────┬─────┘        └────┬─────┘
             │  ui, hooks, api-client, utils, types
             └───────┬───────────┘
                     ▼
              ┌────────────┐
              │ api-client │──► types
              └────────────┘
                     ▲  (HTTP)
              ┌──────┴─────┐
              │    api     │──► utils, types
              └────────────┘
```

Nothing in `packages/` imports from `apps/`. `types` has no dependencies at all, so it can be consumed from any runtime.

## Why two package shapes

`api` compiles to CommonJS, so anything it consumes must publish a `require`-able build with type declarations — hence tsup for `types`, `utils` and `api-client`.

`ui` and `hooks` are only consumed by Next.js. They export TypeScript source and are listed in each app's `transpilePackages`. This preserves `'use client'` directives (which bundlers strip or misplace when a library is pre-bundled) and gives correct source maps in the browser.

## Styling

Tailwind CSS v4, configured in CSS rather than JavaScript. `packages/config/tailwind/theme.css` declares:

1. the **raw palette** — brand gold, warm cream neutrals, admin navy;
2. the **semantic tokens** — `--background`, `--card`, `--primary`, `--border`, status and chart colours — defined for light on `:root` and overridden in `.dark`;
3. an `@theme inline` block that turns those tokens into utilities (`bg-card`, `text-muted-foreground`, …);
4. base and utility layers — focus rings, reduced-motion handling, the gold CTA gradient, the admin sidebar gradient.

Each app's `globals.css` imports the shared file and declares its own `@source`. `next-themes` toggles the `dark` class on `<html>`, and `@custom-variant dark` binds Tailwind's `dark:` variant to it.

`cn()` in `packages/ui` extends `tailwind-merge` with the custom class groups (`shadow-card`, `rounded-field`, `animate-fade-up`, …) so conflicting classes still collapse correctly.

## API conventions

- Global prefix `api/v1`; the version lives in the prefix rather than Nest's URI versioning.
- Environment is validated with Zod at bootstrap (`src/config/env.validation.ts`); a bad value fails the process rather than surfacing later as a runtime error.
- `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so unknown request fields are rejected.
- Helmet, compression and an origin allowlist are applied in `main.ts`.
- Responses are wrapped in `{ success, data, meta, timestamp }` by `TransformInterceptor`, and errors in `{ success: false, statusCode, error, message, errors[], path, timestamp }` by `AllExceptionsFilter`. Both shapes are declared in `packages/types` and unwrapped by `HttpClient`.

### Cross-cutting layer (`src/common`)

| Concern          | Implementation                          | Notes                                                                                                                                                                                                              |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Success envelope | `interceptors/transform.interceptor.ts` | Lifts `{ data, meta }` returns into the envelope's `meta`. Skips `StreamableFile` and handlers marked `@RawResponse()` — needed for invoice PDFs, CSV exports and the Stripe webhook.                              |
| Error envelope   | `filters/all-exceptions.filter.ts`      | Maps `BusinessException` → its domain code, `HttpException` → reason phrase, anything else → a generic 500 that never leaks internals.                                                                             |
| Validation       | `pipes/validation.pipe.ts`              | `whitelist` + `forbidNonWhitelisted`; a custom exception factory flattens nested `ValidationError`s into `{ field, message }` pairs keyed by dotted path, which the front-end feeds straight into React Hook Form. |
| Domain errors    | `exceptions/business.exception.ts`      | Machine-readable codes (`SLOT_SOLD_OUT`, `MAX_TICKETS_EXCEEDED`, …) that the UI branches on. Defaults to 409.                                                                                                      |
| Rate limiting    | `ThrottlerGuard` as `APP_GUARD`         | Configured from `THROTTLE_*`. `@SkipThrottle()` on liveness probes. Covered by an integration test.                                                                                                                |
| Logging          | `logging/logging.module.ts`             | pino, one line per request, `x-request-id` generated or echoed and returned to the client. Authorization headers, cookies and password fields are redacted. Health checks are excluded from access logs.           |
| Swagger          | `decorators/api-response.decorator.ts`  | `@ApiEnvelopeResponse` / `@ApiPaginatedResponse` document the wrapped shape rather than the bare model.                                                                                                            |

### Optional infrastructure

Redis and SMTP are optional in development, and the API degrades rather than failing to boot:

- **No `REDIS_URL`** → BullMQ is not registered, and `MailService` delivers inline instead of enqueuing.
- **No `SMTP_URL`** → the mailer uses `LogMailTransport`, which writes the message to the log.

This keeps `pnpm dev` a single command while the production path (queue + SMTP) stays the same code. Both branches are unit-tested.

## Data layer

PostgreSQL 16 via Prisma 7. Two things changed in Prisma 7 and both are visible here:

1. **The connection URL left the schema.** `prisma/schema.prisma` declares only the provider; the URL lives in `prisma.config.ts` for CLI commands and is supplied at runtime by a driver adapter (`@prisma/adapter-pg`) in `src/database/prisma.service.ts`.
2. **The client is generated as TypeScript source** into `src/generated/prisma` (git-ignored, regenerated by `pnpm --filter @pasta/api build`). It must live under `src/` so the Nest build can compile it within its `rootDir`.

### Modelling rules

| Rule                                           | Why                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| UUID primary keys                              | No enumerable identifiers in URLs or e-tickets.                                                                             |
| Money as `Int` minor units                     | `€118.00` is `11800`. Never a float in the booking path.                                                                    |
| `deletedAt` on user-facing entities            | Tours, blogs and bookings are soft-deleted so historic bookings keep resolving.                                             |
| Denormalised snapshots on `BookingItem`        | `tourTitle`, `date`, `time` and `unitPrice` are copied at purchase, so renaming or repricing a tour never rewrites history. |
| `unitPriceSnapshot` on `CartItem`              | A catalogue change mid-session is detected at checkout instead of silently repricing the basket.                            |
| `@@unique([tourId, date, time])` on `TourSlot` | Enforces the rule the admin UI states verbatim: a time is unique per tour and date.                                         |
| `capacity` / `booked` on `TourSlot`            | Availability is a subtraction, and `booked` is incremented atomically at checkout.                                          |
| `providerIntentId` unique on `Payment`         | Stripe webhook replays cannot double-apply a payment.                                                                       |
| `replacedById` on `RefreshToken`               | Enables refresh-token rotation with theft detection (Phase 5).                                                              |

`Ticket` rows are one per traveller, which is what makes the checkout screen's per-ticket holder-name fields and the e-ticket codes possible.

### Migrations and seed

- `prisma/migrations/20260728000000_init/` — the initial migration, generated with `prisma migrate diff` (89 DDL statements).
- `prisma/seed.ts` — deterministic seed producing the exact figures on the admin screens: 24 tours (18 published, 6 draft) over 6 locations, ~30k availability slots across 90 days, 24 blog posts, and 152 bookings split 98 confirmed / 28 pending / 26 cancelled. A seeded PRNG makes reruns byte-identical.

## Front-end conventions

- Server Components by default; `'use client'` only where interactivity or a browser API is required.
- TanStack Query owns server state; the query client is created per request on the server and once in the browser (`app/providers.tsx`).
- 4xx responses are never retried — `HttpClient` normalises them to `ApiClientError`, and the retry predicate checks the status.
- React Hook Form plus Zod for forms; `ApiClientError.fieldErrors` maps server-side validation straight onto form fields.
