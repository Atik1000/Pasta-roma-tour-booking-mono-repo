#!/usr/bin/env bash
#
# Deploys to a server that has no clone of the repository — the files go up
# over SSH instead of being pulled from GitHub.
#
# Run it ON YOUR MACHINE, from the repository root:
#
#     ./scripts/upload.sh root@72.62.176.168                  # ports 3000/3001/4000
#     ./scripts/upload.sh root@72.62.176.168 8080 8081 8082   # custom ports
#
# It syncs the working tree, then runs the deploy on the far end: bootstrap.sh
# the first time (installs Docker, generates secrets, seeds), deploy.sh every
# time after. The ports only apply to that first run — after that the server's
# .env.production decides, and changing them means editing it there.
#
# Password prompts get old fast. One `ssh-copy-id root@host` and they stop.
set -Eeuo pipefail

readonly TARGET="${1:-}"
readonly WEB_PORT="${2:-3000}"
readonly ADMIN_PORT="${3:-3001}"
readonly API_PORT="${4:-4000}"
readonly REMOTE_DIR="${REMOTE_DIR:-/var/www/pasta-roma-tour}"

log() { printf '\033[1;33m▶ %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -n "$TARGET" ]] || die "Usage: ./scripts/upload.sh <user@host> [web-port] [admin-port] [api-port]"
[[ -f docker/docker-compose.prod.yml ]] || die "Run this from the repository root."
command -v rsync >/dev/null || die "rsync is not installed. brew install rsync"
command -v ssh   >/dev/null || die "ssh is not installed."

# The address the browser will use. Taken from the SSH target, which is right
# whenever you connect to the same address you serve on — the usual case for a
# plain VPS. Behind a bastion or a NAT they differ; set PUBLIC_HOST to override.
host="${PUBLIC_HOST:-${TARGET#*@}}"

ssh -o BatchMode=no "$TARGET" true 2>/dev/null \
  || log "Could not open a test connection non-interactively — expect password prompts."

log "Syncing to ${TARGET}:${REMOTE_DIR}"

# --delete so a file deleted here disappears there too; without it the server
# slowly accumulates dead code that still gets compiled into the image.
#
# .env.production is excluded from BOTH the transfer and the delete pass. It
# only ever exists on the server, holding secrets bootstrap.sh generated there
# — and --delete would otherwise treat "absent locally" as "delete it", wiping
# the database password and JWT secrets of a running deployment.
#
# .git is excluded on purpose: deploy.sh only pulls when a .git is present, so
# leaving it out is what makes the far end use these uploaded files.
ssh "$TARGET" "mkdir -p '$REMOTE_DIR'"
rsync -az --delete --human-readable \
  --exclude '.env.production' \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.turbo' \
  --exclude 'coverage' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude '*.tsbuildinfo' \
  --exclude 'apps/api/src/generated' \
  --exclude 'apps/api/uploads' \
  --exclude 'Admin Panel' \
  --exclude 'Blogs' \
  --exclude 'Cart' \
  --exclude 'Cart checkout_ Booking Checkout' \
  --exclude 'Check Ticket availability' \
  --exclude 'Landing page' \
  --exclude 'My Bookings' \
  --exclude 'Tours' \
  ./ "${TARGET}:${REMOTE_DIR}/"

ok "Files uploaded"

# rsync preserves the executable bit, but a checkout that arrived some other way
# (an unzipped archive, a Windows editor) may not have it. Cheap to be sure.
ssh "$TARGET" "chmod +x '$REMOTE_DIR'/scripts/*.sh"

log "Deploying on $host"

# -t so the remote deploy's progress and any password prompt reach your terminal.
# The first run has no .env.production, so it goes through bootstrap.sh, which
# is the only path that accepts ports; afterwards deploy.sh is the whole job.
ssh -t "$TARGET" "cd '$REMOTE_DIR' && \
  if [ -f .env.production ]; then \
    ./scripts/deploy.sh ${DEPLOY_ARGS:-}; \
  else \
    ./scripts/bootstrap.sh '$host' '$WEB_PORT' '$ADMIN_PORT' '$API_PORT'; \
  fi"

ok "Done."
