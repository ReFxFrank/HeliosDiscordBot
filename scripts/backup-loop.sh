#!/bin/sh
#
# Nightly pg_dump loop for the docker-compose `backup` service (postgres:16-alpine).
# Local dumps land in /backups (the postgres-backups volume) with rolling
# retention. When BACKUP_S3_BUCKET is set, each successful dump is also pushed
# to any S3-compatible store (Cloudflare R2, Backblaze B2, AWS S3, MinIO) via
# rclone, with its own retention — see .env.example for the BACKUP_S3_* keys.
# rclone reads the credentials from RCLONE_S3_* env vars mapped in compose.
set -u

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
OFFSITE_RETENTION_DAYS="${BACKUP_S3_RETENTION_DAYS:-30}"
PREFIX="${BACKUP_S3_PREFIX:-refx-bot}"

offsite=0
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  # The postgres image doesn't ship rclone; install once at container start.
  if command -v rclone >/dev/null 2>&1 || apk add --no-cache rclone >/dev/null 2>&1; then
    offsite=1
    echo "backup: offsite push enabled -> ${BACKUP_S3_BUCKET}/${PREFIX} (${OFFSITE_RETENTION_DAYS}-day retention)"
  else
    echo "backup: WARNING rclone install failed; offsite push disabled, local backups continue" >&2
  fi
fi

echo "backup: nightly pg_dump, ${RETENTION_DAYS}-day local retention"
while true; do
  ts=$(date +%Y%m%d-%H%M%S)
  file="refx-${ts}.sql.gz"
  if pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip >"/backups/${file}"; then
    echo "backup: wrote ${file} ($(du -h "/backups/${file}" | cut -f1))"
    if [ "$offsite" -eq 1 ]; then
      if rclone copyto "/backups/${file}" ":s3:${BACKUP_S3_BUCKET}/${PREFIX}/${file}"; then
        echo "backup: pushed ${file} offsite"
        # Prune old offsite dumps; a prune failure never blocks the loop.
        rclone delete ":s3:${BACKUP_S3_BUCKET}/${PREFIX}" --min-age "${OFFSITE_RETENTION_DAYS}d" ||
          echo "backup: WARNING offsite prune failed" >&2
      else
        echo "backup: offsite push FAILED for ${file} (local copy kept)" >&2
      fi
    fi
  else
    echo "backup: pg_dump FAILED" >&2
    rm -f "/backups/${file}"
  fi
  find /backups -name 'refx-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
  sleep 86400
done
