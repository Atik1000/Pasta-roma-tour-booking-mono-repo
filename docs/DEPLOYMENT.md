# Deployment

Three images, one database, one Redis. Everything is driven by environment variables — no secret is ever baked into an image.

| Image         | From                      | Serves              | Size    |
| ------------- | ------------------------- | ------------------- | ------- |
| `pasta-api`   | `docker/Dockerfile.api`   | NestJS API on 4000  | ~800 MB |
| `pasta-web`   | `docker/Dockerfile.web`   | Public site on 3000 | ~315 MB |
| `pasta-admin` | `docker/Dockerfile.admin` | Admin panel on 3001 | ~315 MB |

## Quick start

One command, on the server, from the repository root:

```bash
./scripts/deploy.sh
```

That is the whole thing, on a bare host and on every release after it. It checks the daemon and the ports, pulls the branch, builds the three images, applies migrations, restarts, and waits for the API to answer its readiness probe before calling the deploy done.

On a host with no `.env.production` it hands off to `scripts/bootstrap.sh` first, which installs Docker if it is missing, generates real secrets, writes the environment for this machine's public address, and seeds the demo catalogue. So the first run and the hundredth are the same command.

The stack starts in order: Postgres and Redis become healthy, a one-shot `migrate` service applies pending migrations, and only then do the API and front-ends start. **A failed migration stops the deploy** rather than letting the API serve against a stale schema.

| Command                       | Use it when                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `./scripts/deploy.sh`         | Normal release. Only changed layers rebuild                                     |
| `./scripts/deploy.sh --clean` | A cached layer is wrong. Discards every cache and rebuilds from the base images |
| `./scripts/deploy.sh --seed`  | Also seed the demo catalogue — but only if it is empty. Combines with `--clean` |

`pnpm run release` and `pnpm run release:clean` are aliases for the first two. (They are not called `deploy`, because `pnpm deploy` is a built-in pnpm command that does something else entirely.)

After a seed, immediately change the seeded admin password — it is a known value.

### Deploying without git

When the server has no clone — no GitHub access, no deploy key, or you simply do not want a checkout there — push the files up instead. From **your machine**, at the repository root:

```bash
./scripts/upload.sh root@203.0.113.10                  # default ports
./scripts/upload.sh root@203.0.113.10 8080 8081 8082   # custom ports
```

It rsyncs the working tree and then runs the deploy on the far end — `bootstrap.sh` the first time, `deploy.sh` after that. Roughly 2.6 MB goes over the wire, not 2.4 GB: `node_modules`, `.git`, `.next`, `dist` and the design folders are all excluded, and Docker rebuilds what it needs.

This works because `deploy.sh` only pulls when a `.git` directory is present. Without one it skips straight to building, so the uploaded files are what gets deployed.

Two things the script is careful about:

- **`.env.production` is never transferred and never deleted.** It exists only on the server, holding the secrets `bootstrap.sh` generated there. Since it is absent locally, a plain `--delete` would read that as "remove it" and take out the database password and JWT secrets of a running deployment.
- **`--delete` is otherwise on**, so a file you delete locally also disappears from the server instead of lingering and being compiled into the next image.

`REMOTE_DIR` overrides the destination (default `/var/www/pasta-roma-tour`), `PUBLIC_HOST` overrides the browser-facing address when it differs from the SSH one, and `DEPLOY_ARGS=--clean` forwards flags to the remote `deploy.sh`.

Run `ssh-copy-id root@your-host` once first, or every deploy asks for the password two or three times.

### Deploying by hand

`deploy.sh` is a wrapper, not a requirement. The equivalent is:

```bash
docker compose -f docker/docker-compose.prod.yml --env-file .env.production up -d --build
```

## Caching and `--clean`

Each Dockerfile mounts the pnpm store as a BuildKit cache shared across all three images, so the second image in a build reuses what the first downloaded — in practice around 500 of 630 packages, turning a ~140 s install into ~19 s.

This means **the build requires `docker buildx`.** The legacy builder does not ignore `RUN --mount`; it fails on it. `deploy.sh` checks for buildx up front so that surfaces as one clear line instead of an error ten minutes into a build. Docker installed from `get.docker.com` (which `bootstrap.sh` uses) includes the plugin; otherwise `apt-get install docker-buildx-plugin`.

`--clean` exists for the case where a cache is the problem — a dependency republished under the same version, a half-written store, a stale Next build. It:

1. removes the workspace's own build output (`.next`, `dist`, `.turbo`, `*.tsbuildinfo`),
2. runs `docker builder prune -af`, which drops the layer cache **and** the pnpm store mounts,
3. rebuilds with `--no-cache --pull`, so even the base images are re-fetched,
4. recreates the containers with `--force-recreate` — without it Compose leaves a container running when only the image changed, and the clean rebuild never reaches traffic.

Two things to know. `docker builder prune -af` is host-wide, so it clears the build cache of every other project on that machine. And a clean build is slow — several minutes, with nothing warm to fall back on.

**`--clean` does not touch your data.** It prunes build cache, stopped containers and unreferenced images. `postgres-data`, `redis-data` and `uploads` are named volumes that stay referenced by the stack, so bookings and uploaded photos survive. Only `docker compose down -v` would destroy those, and nothing in these scripts runs it.

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
