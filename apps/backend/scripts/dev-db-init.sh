#!/bin/sh
# Dev-only DB bootstrap. Run as a one-shot init container in docker-compose.dev.yml.
# postgres image already creates $DB_NAME on first boot (POSTGRES_DB), so we skip
# the `yarn db create` step and just wait, migrate, and (if fresh) seed.
set -e

: "${DB_HOST:?DB_HOST required}"
: "${DB_PORT:?DB_PORT required}"
: "${DB_USER:?DB_USER required}"
: "${DB_PASSWORD:?DB_PASSWORD required}"
: "${DB_NAME:?DB_NAME required}"

echo "[db-init] Waiting for postgres at $DB_HOST:$DB_PORT..."
until PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1; do
  sleep 1
done
echo "[db-init] postgres ready."

# Fresh = no `prompts` table yet. That table is created by the first migration and
# populated by seed, so its presence is a reliable "already bootstrapped" marker.
FRESH=1
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
     -tAc "SELECT to_regclass('public.prompts')" | grep -q prompts; then
  FRESH=0
fi

echo "[db-init] Running migrations..."
yarn --cwd apps/backend db up

if [ "$FRESH" = "1" ]; then
  echo "[db-init] Fresh database detected — seeding..."
  yarn --cwd apps/backend db seed
else
  echo "[db-init] Existing database — skipping seed."
fi

echo "[db-init] Done."
