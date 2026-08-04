#!/usr/bin/env bash
#
# Deploys Pasta Roma Tour on a single Linux host with Docker.
#
# Run it ON the server, from the repository root:
#
#     ./scripts/deploy.sh              # normal release, reuses build cache
#     ./scripts/deploy.sh --clean      # discard every cache, rebuild from zero
#     ./scripts/deploy.sh --seed       # also seed, but only on an empty catalogue
#
# Idempotent: safe to run again for every release. It pulls the branch,
# rebuilds only what changed, applies pending migrations, and restarts. On a
# host with no .env.production it hands off to bootstrap.sh first, so a bare
# server needs this one command and nothing else.
set -Eeuo pipefail

readonly COMPOSE_FILE="docker/docker-compose.prod.yml"
readonly ENV_FILE=".env.production"
readonly BRANCH="${DEPLOY_BRANCH:-main}"

log()  { printf '\033[1;33m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

trap 'die "Deploy failed on line $LINENO. Nothing was restarted; the previous release is still serving."' ERR

# --- arguments -------------------------------------------------------------------
#
# Parsed as flags rather than positionally: `--seed --clean` and `--clean --seed`
# both have to work, and the old `$1 == "--seed"` test silently ignored the flag
# whenever anything else was passed first.

CLEAN=0
SEED=0
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=1 ;;
    --seed)  SEED=1 ;;
    -h|--help)
      cat <<'USAGE'
Deploys Pasta Roma Tour (API, landing page, admin panel) on this host.

  ./scripts/deploy.sh            Release the current branch. Reuses the build
                                 cache, so only what changed is rebuilt.
  ./scripts/deploy.sh --clean    Discard every cache and rebuild from the base
                                 images. Slow. Data volumes are not touched.
  ./scripts/deploy.sh --seed     Also seed the demo catalogue, but only if it
                                 is empty. Combines with --clean.

With no .env.production present this bootstraps the host first, so a bare
server needs nothing but this one command.
USAGE
      exit 0
      ;;
    *) die "Unknown option: $arg. Valid options: --clean, --seed." ;;
  esac
done
readonly CLEAN SEED

# --- preflight -----------------------------------------------------------------

command -v docker >/dev/null || die "Docker is not installed. See docs/SERVER-SETUP.md."
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is missing. See docs/SERVER-SETUP.md."

# The CLI answering does not mean the daemon is up — `docker --version` prints
# happily with dockerd stopped, and the failure then surfaces several steps
# later as an opaque socket error mid-build.
docker info >/dev/null 2>&1 || die "The Docker daemon is not running. Start it with: systemctl enable --now docker"

# The Dockerfiles mount a pnpm store as a build cache, which is a BuildKit
# feature. The legacy builder does not merely ignore `RUN --mount` — it fails on
# it, ten minutes into the build. get.docker.com ships the plugin, so a missing
# buildx means Docker came from somewhere else.
docker buildx version >/dev/null 2>&1 \
  || die "docker buildx is missing, and the build needs it (the Dockerfiles use BuildKit cache mounts). Install it with: apt-get install docker-buildx-plugin  — or reinstall Docker from https://get.docker.com"
[[ -f "$COMPOSE_FILE" ]] || die "Run this from the repository root."

# A host with no environment file has never been deployed to. Rather than stop
# and ask for a second command, hand off to bootstrap.sh, which writes the file
# with real generated secrets and then calls this script back. By that point
# $ENV_FILE exists, so the handoff cannot loop — the guard below only fires if
# bootstrap somehow returned without writing it.
if [[ ! -f "$ENV_FILE" ]]; then
  [[ -z "${PASTA_BOOTSTRAPPED:-}" ]] \
    || die "bootstrap.sh ran but $ENV_FILE is still missing. Create it by hand from .env.production.example."

  # The address the browser will use. A public-IP lookup is the only thing that
  # knows it on a cloud VM, whose own interfaces carry a private address; the
  # LAN address and then localhost are the fallbacks when there is no egress.
  host="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  [[ -n "$host" ]] || host="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -n "$host" ]] || host="localhost"

  log "No $ENV_FILE — first run. Bootstrapping for http://$host"
  export PASTA_BOOTSTRAPPED=1
  exec ./scripts/bootstrap.sh "$host"
fi

# Refuse to deploy with the placeholder secrets still in place: an instance
# that boots with a known JWT secret is an instance anyone can mint tokens for.
# `(CHANGE_ME)?$` rather than `(CHANGE_ME|)$`: an empty alternation is rejected
# outright by some greps, and a guard that errors is a guard that lets the
# deploy through.
if grep -qE '^(JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|POSTGRES_PASSWORD)=(CHANGE_ME)?$' "$ENV_FILE"; then
  die "$ENV_FILE still has placeholder secrets. Fill them in before deploying."
fi

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# A port already in use fails deep inside `up`, after the build and migrations
# have run, with a message about "programming external connectivity" that says
# nothing about which port or what holds it. Checking first turns ten wasted
# minutes into one clear line.
# `|| true` because grep exits 1 on no match, and under `set -e` that aborts the
# deploy — over a variable whose `${port:-default}` fallback already covers it.
port_from_env() { grep -E "^$1=" "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || true; }

# Host ports this stack already publishes, one per line.
#
# Asked of `docker inspect` rather than scraped out of `compose ps --format`:
# the `{{.Publishers}}` field renders as a Go struct — `[{0.0.0.0 3000 8080
# tcp}]` on Compose 2.40 — with no `:8080->` anywhere in it. Grepping for that
# arrow made the guard blind to the stack's own ports, so it mistook them for a
# foreign process and refused every redeploy. It only ever passed on a fresh
# host, where nothing was listening yet. `.HostPort` has been stable for years.
stack_ports() {
  local ids
  ids="$(compose ps -q 2>/dev/null)" || return 0
  [[ -n "$ids" ]] || return 0

  # shellcheck disable=SC2086
  docker inspect \
    --format '{{range $p, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{println .HostPort}}{{end}}{{end}}' \
    $ids 2>/dev/null | grep -E '^[0-9]+$' || true
}

readonly OWN_PORTS="$(stack_ports)"

for setting in WEB_PORT:3000 ADMIN_PORT:3001 API_PORT:4000; do
  name="${setting%%:*}"
  port="$(port_from_env "$name")"
  port="${port:-${setting##*:}}"

  # Skip ports this stack already holds — a redeploy legitimately reuses them.
  if ss -tln 2>/dev/null | grep -qE "[:.]${port}[[:space:]]" \
     && ! grep -qx "$port" <<<"$OWN_PORTS"; then
    die "Port ${port} (${name}) is already in use by something else. Change it in ${ENV_FILE}, or free the port. What holds it: ss -tlnp | grep :${port}"
  fi
done

# --- pull ----------------------------------------------------------------------

if [[ -d .git ]]; then
  log "Fetching $BRANCH"
  git fetch --prune origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
  ok "At $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
fi

# --- clean -----------------------------------------------------------------------
#
# `--clean` is for when a cached layer is the problem: a dependency that was
# republished under the same version, a half-written pnpm store, a stale Next
# build. It throws away every cache the build can draw on and starts again from
# the base images.
#
# It does not touch data. Pruning removes build cache, stopped containers and
# unreferenced images — the postgres-data, redis-data and uploads volumes are
# named and stay referenced by the stack, so bookings and uploaded photos
# survive a clean deploy. Only `docker compose down -v` destroys those, and
# nothing in this script runs it.

if (( CLEAN )); then
  log "Removing workspace build output (.next, dist, .turbo)"
  # These are in .dockerignore, so they never reach the image either way.
  # Removing them frees disk on the host and stops a later local (non-Docker)
  # build from reading a cache that predates this release.
  rm -rf .turbo apps/*/.next apps/*/dist apps/*/.turbo packages/*/dist packages/*/.turbo
  # -prune rather than filtering the results: pnpm puts a node_modules in every
  # workspace, and descending into all of them takes far longer than the delete.
  # Piped to xargs rather than using find's own -delete, because -delete implies
  # -depth, and -depth silently turns -prune into a no-op.
  find . -name node_modules -prune -o -name '*.tsbuildinfo' -print0 2>/dev/null \
    | xargs -0r rm -f || true

  # Also drops the pnpm store and dlx cache mounts the Dockerfiles declare, so
  # the next install genuinely re-resolves every package.
  log "Pruning the Docker build cache — this affects every project on this host"
  docker builder prune -af >/dev/null
  ok "Caches cleared"
fi

# --- build ---------------------------------------------------------------------

if (( CLEAN )); then
  # --pull so the base images are re-fetched too; a clean build that reuses a
  # months-old node:22-alpine is not the fresh build it claims to be.
  log "Building images from scratch — no cache, this takes several minutes"
  compose build --no-cache --pull
else
  log "Building images (only changed layers rebuild)"
  compose build
fi

# --- migrate -------------------------------------------------------------------
#
# Migrations run as their own one-shot service before anything restarts, so a
# failed migration aborts the deploy while the previous release is still up.

log "Applying database migrations"
compose run --rm migrate
ok "Schema up to date"

# --- release -------------------------------------------------------------------

log "Starting services"
if (( CLEAN )); then
  # Compose leaves a container alone when its config hash is unchanged. After a
  # --no-cache rebuild the image is new but the config is not, so without this
  # the old container keeps running and the clean rebuild never reaches traffic.
  compose up -d --remove-orphans --force-recreate
else
  compose up -d --remove-orphans
fi

# --- verify --------------------------------------------------------------------
#
# A deploy that "succeeded" while the API is down is not a deploy. Poll the
# readiness endpoint, which reports 503 until the database actually answers.

log "Waiting for the API to become ready"
api_port="$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2)"
api_port="${api_port:-4000}"

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${api_port}/api/v1/health/ready" >/dev/null 2>&1; then
    ok "API is ready"
    break
  fi
  [[ $attempt -eq 30 ]] && die "API never became ready. Inspect: docker compose -f $COMPOSE_FILE logs api"
  sleep 2
done

# --- seed ----------------------------------------------------------------------
#
# Only ever on an empty catalogue. The seed truncates every table, so running it
# against a live database would destroy real bookings; the emptiness check is
# what makes `--seed` safe to leave in a deploy command you run every release.

if (( SEED )); then
  log "Checking whether the catalogue is empty"
  tours="$(compose exec -T postgres psql -U "${POSTGRES_USER:-pasta}" -d "${POSTGRES_DB:-pasta_roma_tour}" \
    -tAc 'SELECT COUNT(*) FROM tours' 2>/dev/null || echo 0)"

  if [[ "${tours//[^0-9]/}" == "0" ]]; then
    log "Seeding the demo catalogue"
    compose run --rm api node_modules/.bin/prisma db seed
    ok "Seeded. Change the seeded admin password now — it is a known value."
  else
    ok "Catalogue already has ${tours} tours; not seeding."
  fi
fi

log "Pruning dangling images"
docker image prune -f >/dev/null

echo
ok "Deployed."
compose ps
