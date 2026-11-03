# Operations & uptime

How to keep a production ReFx Assistant deployment healthy. Assumes the Docker Compose
setup (`docker-compose.yml` + `docker-compose.prod.yml`).

## Staying up

- **Auto-restart.** Every service (`bot`, `web`, `postgres`, `redis`) sets
  `restart: unless-stopped`, so a crash or a host reboot brings them back. The
  bot also runs under a `ShardingManager` with `respawn: true`, so a dead shard
  respawns without taking the process down.
- **Healthchecks.** Postgres and Redis have healthchecks and the app waits on
  them (`depends_on: condition: service_healthy`). The `web` service has an HTTP
  healthcheck, so a hung-but-running container shows `unhealthy` in
  `docker compose ps`.
- **Check status quickly:**
  ```bash
  docker compose ps            # per-container state + health
  docker compose logs -f bot   # live bot logs
  docker compose logs -f web   # live web logs
  ```

## Monitoring & alerting

- **Sentry (errors).** Set `SENTRY_DSN` in `.env` (bot + web read the same var).
  The bot logs `Sentry error tracking enabled` at boot when it's on, and its
  default integrations capture uncaught exceptions / unhandled rejections. Add
  **alert rules** in the Sentry project (e.g. notify on any new issue, or on a
  spike) so failures actually page you.
- **External uptime monitor.** Point an uptime service (UptimeRobot, BetterStack,
  Pingdom, …) at your public site and the **status page** (`/status`), which
  reflects real per-shard heartbeats over Redis. This catches a full outage that
  internal monitoring can't report.
- **Metrics (optional).** Set `METRICS_ENABLED=true` to expose Prometheus
  `/metrics` + `/health` per shard on `METRICS_PORT + shardId`, for Grafana/
  Prometheus dashboards.

## Backups

- Nightly Postgres dumps run on the VPS (retained `BACKUP_RETENTION_DAYS`, default
  14). Set the `BACKUP_S3_*` variables to also push each dump to S3-compatible
  storage (Cloudflare R2, Backblaze B2, AWS S3, MinIO). See `.env.example`.
- **Test your restore** — a backup you've never restored isn't a backup. Run
  `scripts/verify-backup.sh` (spins up a throwaway Postgres and restores the
  latest dump into it). Do this after any schema-heavy change.

## Deploying updates

```bash
./scripts/redeploy.sh
```
Pulls `origin/main`, installs, runs `prisma migrate deploy`, rebuilds + restarts
the bot and web, and re-registers slash commands. Environment changes in `.env`
require a redeploy (or at least `docker compose up -d <service>`) because vars are
read at container start.

## Secrets

- All secrets live in `.env` only — never commit it. Rotate a leaked key at its
  source (Discord, Cloudflare, etc.).
- In production the data stores bind to `127.0.0.1` (`docker-compose.prod.yml`),
  Redis requires `REDIS_PASSWORD`, and `ENCRYPTION_KEY` must stay stable (it
  decrypts stored third-party tokens — changing it orphans them).

## Related docs

- `.env.example` — every configuration variable, annotated.
