# Development guide

## First run

```bash
nvm use                 # Node 22.13
corepack enable         # pnpm
pnpm install
cp .env.example .env

# Postgres, Redis and a mail catcher
docker compose -f docker/docker-compose.yml up -d

pnpm --filter @pasta/api db:migrate    # apply migrations
pnpm --filter @pasta/api db:seed       # 24 tours, 152 bookings, 24 posts

pnpm dev
```

Mailpit's web UI is at http://localhost:8025 — every mail the API sends in development lands there.

### Docker runtime on macOS

Any Docker-compatible runtime works. This machine uses **Colima**, which needs no privileged helper and therefore no sudo password:

```bash
brew install colima docker docker-compose
mkdir -p ~/.docker/cli-plugins
ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose
colima start --cpu 2 --memory 4 --disk 20
```

Docker Desktop works too, but `brew install --cask docker-desktop` needs sudo to link its CLI and must be run from an interactive terminal.

Seeded admin login: `admin@pastaromatour.com` / `ChangeMe123!`

## Database workflow

| Command                                | Effect                                               |
| -------------------------------------- | ---------------------------------------------------- |
| `pnpm --filter @pasta/api db:migrate`  | Create and apply a migration from schema changes     |
| `pnpm --filter @pasta/api db:deploy`   | Apply pending migrations (CI/production)             |
| `pnpm --filter @pasta/api db:seed`     | Re-seed — **truncates every table first**            |
| `pnpm --filter @pasta/api db:reset`    | Drop, re-migrate and re-seed                         |
| `pnpm --filter @pasta/api db:studio`   | Prisma Studio                                        |
| `pnpm --filter @pasta/api db:generate` | Regenerate the client (also runs as part of `build`) |

The generated client lives in `apps/api/src/generated/prisma` and is git-ignored. If your editor reports missing Prisma types after a fresh clone, run `db:generate`.

`pnpm dev` starts all three apps. Turborepo builds `types`, `utils` and `api-client` first, then runs the apps in watch mode.

## Working on one app

```bash
pnpm --filter @pasta/web dev
pnpm --filter @pasta/admin dev
pnpm --filter @pasta/api dev
```

If you are also editing a compiled package, run it in watch mode alongside:

```bash
pnpm --filter @pasta/utils dev      # tsup --watch
```

`ui` and `hooks` need no watcher — the Next.js apps compile their source directly.

## Adding a dependency

```bash
pnpm --filter @pasta/web add framer-motion
pnpm --filter @pasta/api add -D @types/passport
pnpm add -Dw prettier-plugin-organize-imports    # root-level tooling only
```

Never edit a `package.json` by hand and re-run install — use the filter form so the lockfile stays consistent.

## Conventions

**No `any`.** ESLint fails the build on it. Reach for `unknown` plus a type guard from `@pasta/utils`.

**Design tokens, not hex values.** If a colour is missing, add it to `packages/config/tailwind/theme.css` in both the light and dark blocks.

**Money is minor units.** Store and transport integers; format with `formatMoney` at render time.

**One component, one file**, kebab-case filenames, named exports, and a `'use client'` directive only where it is genuinely needed.

**Imports are extensionless and relative within a package**; across packages always use the package name (`@pasta/ui`), never a deep relative path.

## Before you commit

Husky runs `lint-staged` on staged files (ESLint fix and Prettier). To reproduce the full CI gate locally:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Turborepo cache

Task results are cached in `.turbo/`. `pnpm clean` removes build output; `pnpm turbo run build --force` bypasses the cache for one run.

## Ports

| Service  | Port |
| -------- | ---- |
| web      | 3000 |
| admin    | 3001 |
| api      | 4000 |
| Postgres | 5432 |
| Redis    | 6379 |

## Troubleshooting

**`Invalid environment configuration`** — the API validates env at boot. The message lists every offending variable; compare against `.env.example`.

**A shared package change is not visible in an app** — `types`, `utils` and `api-client` are compiled. Run `pnpm build --filter @pasta/utils` or start its watcher.

**Tailwind class has no effect** — check that the file is covered by an `@source` glob in the app's `globals.css` or in the shared theme file.
