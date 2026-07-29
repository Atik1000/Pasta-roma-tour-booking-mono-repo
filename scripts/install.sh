#!/usr/bin/env bash
#
# Whole-host installer. Clones the repository and hands over to bootstrap.sh.
#
#     ./install.sh <public-host> [web-port] [admin-port] [api-port]
#
# For a private repository, export a token first so the clone does not stop to
# ask. Use a fresh, repo-scoped token — and note it is written into the remote
# URL, which this script strips again once the clone succeeds.
#
#     GITHUB_TOKEN=ghp_xxx ./install.sh 203.0.113.10
set -Eeuo pipefail

readonly HOST="${1:-}"
readonly REPO="${REPO:-Atik1000/Pasta-roma-tour-booking-mono-repo}"
readonly TARGET="${TARGET:-/var/www/pasta-roma-tour}"

log() { printf '\033[1;33m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -n "$HOST" ]] || die "Usage: ./install.sh <public-host> [web-port] [admin-port] [api-port]"

command -v git >/dev/null || { log "Installing git"; (apt-get update -qq && apt-get install -y -qq git) || yum install -y git; }

if [[ -d "$TARGET/.git" ]]; then
  log "Repository already present at $TARGET"
else
  log "Cloning into $TARGET"
  mkdir -p "$(dirname "$TARGET")"

  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    git clone "https://${GITHUB_TOKEN}@github.com/${REPO}.git" "$TARGET"
    # The token would otherwise sit in .git/config in plain text for anyone
    # with shell access to read.
    git -C "$TARGET" remote set-url origin "https://github.com/${REPO}.git"
    log "Token removed from the git remote"
  else
    git clone "https://github.com/${REPO}.git" "$TARGET"
  fi
fi

cd "$TARGET"
exec ./scripts/bootstrap.sh "$@"
