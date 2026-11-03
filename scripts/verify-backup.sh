#!/usr/bin/env bash
#
# Restore drill: prove the nightly backups actually restore, WITHOUT touching
# the live database. Takes the newest dump from the backup volume (or a file
# you pass), replays it into a throwaway Postgres container, sanity-checks the
# result, and tears everything down.
#
#   bash scripts/verify-backup.sh                     # newest dump in the volume
#   bash scripts/verify-backup.sh refx-....sql.gz   # a specific local file
#
# Safe to run anytime — it never connects to the live database.
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile apps)
SCRATCH="refx-verify-backup-$$"
WORKDIR="$(mktemp -d)"

cleanup() {
  docker rm -f "$SCRATCH" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

# ── 1. Get a dump ────────────────────────────────────────────────────────────
if [ "${1:-}" ]; then
  DUMP="$1"
  [ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }
else
  LATEST="$("${COMPOSE[@]}" exec -T backup sh -c "ls -t /backups/refx-*.sql.gz 2>/dev/null | head -1" | tr -d '\r')"
  [ -n "$LATEST" ] || { echo "FAIL: no dumps found in the backup volume" >&2; exit 1; }
  echo "▸ Newest dump: $LATEST"
  "${COMPOSE[@]}" cp "backup:$LATEST" "$WORKDIR/dump.sql.gz"
  DUMP="$WORKDIR/dump.sql.gz"
fi
echo "▸ Verifying $(du -h "$DUMP" | cut -f1) dump"

# ── 2. Throwaway Postgres (no ports published, no volumes) ──────────────────
# The scratch superuser MUST be named like the live role: pg_dump embeds
# `ALTER ... OWNER TO <role>` statements, and with ON_ERROR_STOP a missing
# role aborts the replay. Read it from .env like compose does (default refx).
PG_USER="$(sed -n 's/^POSTGRES_USER=//p' .env 2>/dev/null | tail -1)"
PG_USER="${PG_USER%\"}"; PG_USER="${PG_USER#\"}"
PG_USER="${PG_USER:-refx}"

echo "▸ Starting scratch Postgres container (role: $PG_USER)"
docker run -d --name "$SCRATCH" \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify \
  postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$SCRATCH" pg_isready -U "$PG_USER" -d verify >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$SCRATCH" pg_isready -U "$PG_USER" -d verify >/dev/null 2>&1 ||
  { echo "FAIL: scratch Postgres never became ready" >&2; exit 1; }

# ── 3. Replay the dump ───────────────────────────────────────────────────────
echo "▸ Restoring dump into the scratch database"
if ! gunzip -c "$DUMP" | docker exec -i "$SCRATCH" psql -U "$PG_USER" -d verify \
  --set ON_ERROR_STOP=1 -q >/dev/null; then
  echo "FAIL: dump did not replay cleanly" >&2
  exit 1
fi

# ── 4. Sanity checks ─────────────────────────────────────────────────────────
q() { docker exec "$SCRATCH" psql -U "$PG_USER" -d verify -tA -c "$1" | tr -d '\r'; }

TABLES="$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
MIGRATIONS_IN_DUMP="$(q "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL" 2>/dev/null || echo 0)"
MIGRATIONS_IN_REPO="$(find packages/database/prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
GUILDS="$(q 'SELECT count(*) FROM "Guild"' 2>/dev/null || echo MISSING)"

echo
echo "  Tables restored:        $TABLES"
echo "  Applied migrations:     $MIGRATIONS_IN_DUMP (repo has $MIGRATIONS_IN_REPO)"
echo "  Guild rows:             $GUILDS"

FAIL=0
[ "$TABLES" -ge 10 ] || { echo "FAIL: suspiciously few tables ($TABLES)" >&2; FAIL=1; }
[ "$GUILDS" != "MISSING" ] || { echo "FAIL: Guild table missing from dump" >&2; FAIL=1; }
[ "$MIGRATIONS_IN_DUMP" -gt 0 ] || { echo "FAIL: no applied migrations recorded in dump" >&2; FAIL=1; }
if [ "$MIGRATIONS_IN_DUMP" -lt "$MIGRATIONS_IN_REPO" ]; then
  echo "  note: dump predates $((MIGRATIONS_IN_REPO - MIGRATIONS_IN_DUMP)) newer migration(s) — expected for older dumps"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ Backup verifies: the dump restores cleanly and looks structurally sound."
else
  echo "❌ Backup verification FAILED — do not rely on this dump." >&2
  exit 1
fi
