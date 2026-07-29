# Deployment

Three images, one database, one Redis. Everything is driven by environment variables — no secret is ever baked into an image.

| Image         | From                      | Serves              | Size    |
| ------------- | ------------------------- | ------------------- | ------- |
| `pasta-api`   | `docker/Dockerfile.api`   | NestJS API on 4000  | ~800 MB |
| `pasta-web`   | `docker/Dockerfile.web`   | Public site on 3000 | ~315 MB |
| `pasta-admin` | `docker/Dockerfile.admin` | Admin panel on 3001 | ~315 MB |

## Quick start

```bash
cp .env.example .env.production      # then fill it in — see the table below
docker compose -f docker/docker-compose.prod.yml --env-file .env.production up -d --build
```

The stack starts in order: Postgres and Redis become healthy, a one-shot `migrate` service applies pending migrations, and only then do the API and front-ends start. **A failed migration stops the deploy** rather than letting the API serve against a stale schema.

Seed a brand-new environment once:

```bash
docker compose -f docker/docker-compose.prod.yml --env-file .env.production \
  run --rm api prisma db seed
```

Then immediately change the seeded admin password — it is a known value.

## Required environment

| Variable                                                               | Notes                                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                    | Compose fails fast if the first two are missing                                     |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                              | 32+ chars each, different from one another. `openssl rand -base64 48`               |
| `CORS_ORIGINS`                                                         | Comma-separated browser origins. Anything not listed is refused                     |
| `SITE_URL`, `ADMIN_URL`                                                | Used to build links inside emails                                                   |
| `PUBLIC_API_URL`                                                       | The API URL **as the browser sees it** — inlined into both front-ends at build time |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Card payment. Omit them and the payment routes answer 503 — see `docs/PAYMENTS.md`  |
| `SMTP_URL`, `MAIL_FROM`                                                | Without SMTP the API logs mail instead of sending it                                |
| `SWAGGER_ENABLED`                                                      | Defaults to `false` in production                                                   |

The API refuses to start in production without `DATABASE_URL` and both JWT secrets — see `productionEnvSchema`. That is deliberate: an instance that boots without them would fail at the first login instead of at deploy time.

### `NEXT_PUBLIC_*` is build-time, not runtime

Next inlines these into the client bundle during `next build`, so they are **build args**, not environment variables. Pointing a front-end at a different API means rebuilding its image, not restarting the container.

## Building images by hand

```bash
docker build -f docker/Dockerfile.api -t pasta-api:$(git rev-parse --short HEAD) .

docker build -f docker/Dockerfile.web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://example.com \
  --build-arg NEXT_PUBLIC_ADMIN_URL=https://admin.example.com \
  -t pasta-web:$(git rev-parse --short HEAD) .
```

Each Dockerfile runs `turbo prune` first, so a change confined to the admin panel does not invalidate the API's dependency layer.

## Health checks

| Endpoint                   | Meaning                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `GET /api/v1/health`       | The process is alive. Never rate-limited, excluded from access logs |
| `GET /api/v1/health/ready` | The database answered. Returns **503** when it did not              |

Point liveness probes at `/health` and readiness probes at `/health/ready`. Using `/health` for readiness would keep an instance in rotation while its database is unreachable.

## Migrations

Migrations ship inside the API image, so the artefact that serves traffic is the one that migrated the schema.

```bash
docker compose -f docker/docker-compose.prod.yml run --rm migrate            # apply pending
docker compose -f docker/docker-compose.prod.yml run --rm api \
  prisma migrate status                                    # inspect
```

Migrations are forward-only. To undo one, write a new migration that reverses it — never edit an applied migration, because the checksum will no longer match and `migrate deploy` will refuse to run.

## What runs on a schedule

The API runs its own cron jobs; no external scheduler is needed:

| Job                     | When         | Why                                        |
| ----------------------- | ------------ | ------------------------------------------ |
| Expire pending bookings | every 10 min | Releases seats held by abandoned checkouts |
| Purge expired carts     | hourly       | Keeps the cart tables small                |
| Purge refresh tokens    | 03:00 daily  | Drops expired and long-revoked sessions    |

Running several API replicas is safe: every job narrows by a time window and updates only rows still in the state it is clearing.

## Scaling notes

- **The API is stateless** and scales horizontally. Sessions live in Postgres, not memory.
- **Rate limiting is currently in-memory**, so limits are per-instance. Behind more than one replica, move `ThrottlerModule` onto Redis storage or enforce limits at the edge.
- **BullMQ needs Redis.** Without `REDIS_URL` the API still runs, but mail is delivered inline instead of queued.
- **Postgres is the only stateful service.** Back up the `postgres-data` volume, or use managed Postgres and drop that service from the compose file.

## Security checklist before going live

- [ ] Fresh `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, not the `.env.example` placeholders
- [ ] `CORS_ORIGINS` lists only your real front-end origins
- [ ] `SWAGGER_ENABLED=false`
- [ ] TLS terminated in front of every service — refresh cookies set `secure` in production and will not survive plain HTTP
- [ ] Seeded admin password changed
- [ ] Postgres and Redis not published to the host (the prod compose file only `expose`s them)
- [ ] Database backups scheduled and a restore actually tested

## CI

`.github/workflows/ci.yml` runs on every push and pull request: format check, lint, typecheck, unit tests, migrations against a Postgres service container, end-to-end tests, then a full build. Image build and publish are not wired up — add a release workflow when you have chosen a registry.
