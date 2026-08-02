#!/usr/bin/env bash
#
# Deploys Pasta Roma Tour on a single Linux host with Docker.
#
# Run it ON the server, from the repository root:
#
#     ./scripts/deploy.sh
#
# Idempotent: safe to run again for every release. It pulls the branch,
# rebuilds only what changed, applies pending migrations, and restarts.
set -Eeuo pipefail

readonly COMPOSE_FILE="docker/docker-compose.prod.yml"
readonly ENV_FILE=".env.production"
readonly BRANCH="${DEPLOY_BRANCH:-main}"

log()  { printf '\033[1;33m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

trap 'die "Deploy failed on line $LINENO. Nothing was restarted; the previous release is still serving."' ERR

# --- preflight -----------------------------------------------------------------

command -v docker >/dev/null || die "Docker is not installed. See docs/SERVER-SETUP.md."
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is missing. See docs/SERVER-SETUP.md."

# The CLI answering does not mean the daemon is up — `docker --version` prints
# happily with dockerd stopped, and the failure then surfaces several steps
# later as an opaque socket error mid-build.
docker info >/dev/null 2>&1 || die "The Docker daemon is not running. Start it with: systemctl enable --now docker"
[[ -f "$COMPOSE_FILE" ]] || die "Run this from the repository root."
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE is missing. Copy .env.production.example and fill it in."

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

# --- build ---------------------------------------------------------------------

log "Building images (only changed layers rebuild)"
compose build

# --- migrate -------------------------------------------------------------------
#
# Migrations run as their own one-shot service before anything restarts, so a
# failed migration aborts the deploy while the previous release is still up.

log "Applying database migrations"
compose run --rm migrate
ok "Schema up to date"

# --- release -------------------------------------------------------------------

log "Starting services"
compose up -d --remove-orphans

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

if [[ "${1:-}" == "--seed" ]]; then
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
