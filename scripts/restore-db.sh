#!/usr/bin/env bash
#
# Restore a gzipped pg_dump (made by the `backup` compose service) into the
# running Postgres container. DESTRUCTIVE: wipes the current schema first.
#
#   # 1. List available backups
#   docker compose --profile apps exec backup ls -lh /backups
#
#   # 2. Copy one out of the volume
#   docker compose --profile apps cp backup:/backups/refx-YYYYMMDD-HHMMSS.sql.gz .
#
#   # 3. Stop the apps so nothing writes mid-restore, then restore
#   docker compose --profile apps stop bot web
#   bash scripts/restore-db.sh refx-YYYYMMDD-HHMMSS.sql.gz
#   docker compose --profile apps start bot web
set -euo pipefail

FILE="${1:?usage: scripts/restore-db.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

DB_USER="${POSTGRES_USER:-refx}"
DB_NAME="${POSTGRES_DB:-refx}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "About to WIPE database '$DB_NAME' and restore from: $FILE"
read -r -p "Type the database name to confirm: " CONFIRM
[ "$CONFIRM" = "$DB_NAME" ] || { echo "Aborted."; exit 1; }

# Drop everything owned by the app schema, then replay the dump.
"${COMPOSE[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gunzip -c "$FILE" | "${COMPOSE[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME"

echo "✅ Restore complete. Start the apps again with:"
echo "   ${COMPOSE[*]} --profile apps start bot web"
