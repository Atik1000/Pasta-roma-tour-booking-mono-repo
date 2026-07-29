#!/usr/bin/env bash
#
# Fills the three secrets in .env.production with fresh random values.
# Run once, on the server, before the first deploy.
set -Eeuo pipefail

readonly ENV_FILE=".env.production"

[[ -f "$ENV_FILE" ]] || { echo "Copy .env.production.example to $ENV_FILE first." >&2; exit 1; }

secret() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }

# `sed -i` differs between GNU and BSD; rewriting the file avoids the difference.
tmp="$(mktemp)"
while IFS= read -r line; do
  case "$line" in
    POSTGRES_PASSWORD=CHANGE_ME)  echo "POSTGRES_PASSWORD=$(secret)" ;;
    JWT_ACCESS_SECRET=CHANGE_ME)  echo "JWT_ACCESS_SECRET=$(secret)" ;;
    JWT_REFRESH_SECRET=CHANGE_ME) echo "JWT_REFRESH_SECRET=$(secret)" ;;
    *) echo "$line" ;;
  esac
done < "$ENV_FILE" > "$tmp"

mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Secrets written to $ENV_FILE (mode 600)."
echo "They are not printed here on purpose — read the file if you need them."
