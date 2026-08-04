# Pasta Roma Tour

Tour and ticket booking platform for Rome and Italy experiences — public website, admin panel and API in a single Turborepo monorepo.

| Package               | What it is                              | Dev URL                      |
| --------------------- | --------------------------------------- | ---------------------------- |
| `apps/web`            | Public website (Next.js 15, App Router) | http://localhost:3000        |
| `apps/admin`          | Admin panel (Next.js 15, App Router)    | http://localhost:3001        |
| `apps/api`            | REST API (NestJS 11)                    | http://localhost:4000/api/v1 |
| `packages/ui`         | Shared design system                    | —                            |
| `packages/types`      | Domain types and enums                  | —                            |
| `packages/utils`      | Framework-agnostic helpers              | —                            |
| `packages/hooks`      | Shared React hooks                      | —                            |
| `packages/api-client` | Typed SDK for the API                   | —                            |
| `packages/config`     | TypeScript / ESLint / Tailwind config   | —                            |

Swagger UI: http://localhost:4000/api/v1/docs

---

## Requirements

- Node.js ≥ 20.11 (`.nvmrc` pins 22.13.0 — run `nvm use`)
- pnpm ≥ 9 (`corepack enable` is enough)
- PostgreSQL 16 and Redis 7 — from Phase 4 onwards, or via `docker compose up` (Phase 11)

## Getting started

```bash
pnpm install
cp .env.example .env      # then fill in the values you need
pnpm dev                  # runs web, admin and api together
```

Run one app at a time with `pnpm --filter @pasta/web dev` (or `@pasta/admin`, `@pasta/api`).

## Scripts

| Command             | Effect                                         |
| ------------------- | ---------------------------------------------- |
| `pnpm dev`          | Every app in watch mode                        |
| `pnpm build`        | Build packages, then apps, in dependency order |
| `pnpm lint`         | ESLint across the workspace                    |
| `pnpm typecheck`    | `tsc --noEmit` across the workspace            |
| `pnpm test`         | Vitest (packages) and Jest (API)               |
| `pnpm format`       | Prettier write                                 |
| `pnpm format:check` | Prettier check — the same gate CI runs         |
| `pnpm clean`        | Remove build output                            |

## Architecture notes

**Design tokens live in one file.** `packages/config/tailwind/theme.css` holds the entire visual language taken from the UI designs — the gold/bronze brand ramp, the warm cream canvas, the navy admin sidebar, status colours, chart colours, elevation, radii and motion. Both front-ends import it, and both light and dark themes are defined there. Never hard-code a hex value in a component.

**Two package shapes.** `types`, `utils` and `api-client` are compiled with tsup to dual ESM/CJS with declarations, because the CommonJS NestJS build consumes them. `ui` and `hooks` ship TypeScript source and are compiled by each Next.js app via `transpilePackages` — that keeps `'use client'` boundaries intact.

**Strict everywhere.** `packages/config/typescript/base.json` turns on `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals` and friends; `@typescript-eslint/no-explicit-any` is an error, not a warning.

**Money is integers.** Amounts are stored and transported as minor units (cents) and formatted at the edge with `formatMoney`. No floats in the booking path.

**Adults-only ticketing.** Per the client mark-ups on the designs, child tickets were removed from the product. There is a single adult price and a single availability count per slot. See `PHASE-1-ANALYSIS.md` §2.

## Testing

| Command                             | Covers                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| `pnpm test`                         | Unit and component tests (utils, API services, UI components)         |
| `pnpm --filter @pasta/api test:e2e` | End-to-end against a real Postgres — booking flow, auth, admin access |

The e2e suite needs a database:

```bash
docker compose -f docker/docker-compose.yml up -d postgres
docker exec pasta-postgres psql -U pasta -d postgres -c "CREATE DATABASE pasta_roma_tour_test OWNER pasta;"
DATABASE_URL="postgresql://pasta:pasta@localhost:5432/pasta_roma_tour_test?schema=public" \
  pnpm --filter @pasta/api exec prisma migrate deploy
pnpm --filter @pasta/api test:e2e
```

Nothing is mocked there: the same guards, pipes and SQL that ship are what the tests exercise — including the concurrency test that proves seats cannot be oversold.

## Deployment

One command on the server, for the first release and every one after it:

```bash
./scripts/deploy.sh              # build, migrate, restart, verify
./scripts/deploy.sh --clean      # same, but discard every cache first
```

On a host with no `.env.production` this bootstraps the machine first — installs Docker, generates secrets, writes the environment, seeds the catalogue — so a bare server needs nothing else. Data volumes are never touched, including by `--clean`.

If the server has no clone of the repo, push the files up instead — run this **on your machine**:

```bash
./scripts/upload.sh root@your-server 8080 8081 8082
```

See `docs/DEPLOYMENT.md` for the environment variables, health-check endpoints, migration workflow and the pre-launch security checklist.

## Documentation

- `PHASE-1-ANALYSIS.md` — screen inventory, mark-up decisions, domain model, API surface, roadmap
- `docs/ARCHITECTURE.md` — how the pieces fit together
- `docs/DEVELOPMENT.md` — day-to-day workflow and conventions
- `docs/DEPLOYMENT.md` — Docker images, environment, migrations, scaling
- Swagger — `http://localhost:4000/api/v1/docs` while the API is running

## Status

Every screen in the designs is built and running on live data, with filtering, paging and every control wired to the API.

Known gaps: card payment is not wired (bookings are created `PENDING` and hold seats for 30 minutes, and `STRIPE_SECRET_KEY` being unset makes the payment endpoints answer 503), and the seeded imagery is placeholder URLs that do not resolve — `Thumbnail` falls back to the brand gradient for those.

Payment records are editable in the admin panel only when the business recorded them itself. Anything Stripe captured is read-only there and the API rejects writes to it, so invoices, exports and the revenue figures cannot disagree with the money that actually moved. See `PaymentDetailsPanel` and `AdminWriteService.updatePayment`.
