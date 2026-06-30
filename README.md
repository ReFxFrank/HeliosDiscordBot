# Helios

A fully self-hosted, premium-grade Discord bot **and** web dashboard. Because
it's self-hosted, every feature is unlocked — there's no paywall — while an
optional per-guild feature-flag layer lets an operator gate features into a
"premium" tier if they ever run it for others.

> **Status: Phase 2 — Dashboard core.** Foundation, a sharded bot core
> (moderation commands, durable jobs, live config cache), and the dashboard
> (Discord login, server selector, live module toggles, audit log) are in place.
> Feature modules land in later phases (see [Roadmap](#roadmap)).

## Architecture at a glance

The bot and dashboard are **separate processes** that never call Discord on each
other's behalf. They coordinate through **Postgres** (durable state) and
**Redis** (cache invalidation + live commands):

- The dashboard **writes** config to Postgres, then publishes
  `helios:config:update` on Redis.
- The bot **subscribes** and invalidates its in-memory config cache, lazily
  reloading from Postgres — so dashboard edits go live in **&lt;1s** with no
  restart.
- Guild name/icon/member-count are mirrored into Postgres, so the dashboard
  never hits the Discord API in the request path.

`packages/shared` is the contract layer: config zod schemas, Redis channel
names, and enums live there once and are imported by both sides so they can
never drift.

## Tech stack

| Layer         | Choice                                             |
| ------------- | -------------------------------------------------- |
| Runtime       | Node.js 20+ LTS, TypeScript 5 (`strict`)           |
| Monorepo      | pnpm workspaces + Turborepo                        |
| Bot           | discord.js v14                                     |
| Dashboard     | Next.js 15 (App Router, React 19), Tailwind CSS v4 |
| Database      | PostgreSQL 16 + Prisma                             |
| Cache / queue | Redis 7 + ioredis + BullMQ                         |
| Music         | Lavalink v4                                        |
| Validation    | zod (shared bot ↔ web)                             |
| Logging       | pino                                               |
| Deploy        | Docker + docker-compose                            |

## Repository layout

```
helios/
├── apps/
│   ├── bot/        # discord.js bot (sharded)
│   └── web/        # Next.js dashboard
├── packages/
│   ├── database/   # Prisma schema + generated client (single source of truth)
│   ├── shared/     # zod config schemas, enums, Redis channel contracts, env loader
│   └── jobs/       # BullMQ queue + job type definitions (imported by bot AND web)
├── lavalink/       # application.yml for the Lavalink profile
└── docker-compose.yml
```

## Prerequisites

- **Node.js 20+** and **pnpm 9+** (`corepack enable`)
- **Docker** + Docker Compose
- A **Discord application** ([developer portal](https://discord.com/developers/applications))
  with the **Server Members** and **Message Content** privileged intents enabled.

## Quick start (local development)

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
#    → fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, AUTH_SECRET, etc.

# 3. Start infrastructure (Postgres + Redis)
docker compose up -d

# 4. Apply database migrations
pnpm db:deploy        # or `pnpm db:migrate` to create/apply in dev

# 5. Run the bot and dashboard with hot reload
pnpm dev
```

The dashboard serves on <http://localhost:3000>.

### Useful scripts

| Command                | Description                                   |
| ---------------------- | --------------------------------------------- |
| `pnpm dev`             | Run bot + dashboard concurrently (hot reload) |
| `pnpm typecheck`       | Type-check every package/app                  |
| `pnpm lint`            | Lint the whole repo                           |
| `pnpm format`          | Prettier write                                |
| `pnpm db:migrate`      | Create + apply a dev migration                |
| `pnpm db:deploy`       | Apply pending migrations (prod-safe)          |
| `pnpm db:studio`       | Open Prisma Studio                            |
| `pnpm deploy:commands` | Register slash commands (Phase 1+)            |

## Running with Docker

```bash
# Infra only (default):
docker compose up -d

# Add Lavalink (music):
docker compose --profile music up -d

# Build + run the bot and dashboard too:
docker compose --profile apps up -d --build
```

## Roadmap

- **Phase 0 — Foundation & infra** ✅ (this commit): monorepo, docker-compose,
  baseline Prisma schema + migration, shared contract layer, env loader,
  logging, lint/typecheck/format.
- **Phase 1 — Bot core** ✅: sharded client, command/event loaders, config cache
  - Redis invalidation, permissions, BullMQ wiring, moderation commands.
- **Phase 2 — Dashboard core** ✅: Auth.js Discord login, server selector
  (Manage-Server gated), glass design system, live module toggles, audit log.
- **Phase 3 — Core modules**: moderation/automod, logging, welcome, leveling,
  roles, custom commands, starboard, giveaways, tickets, and more.
- **Phase 4 — Premium modules**: music, economy, social notifications, temp
  voice, feature-flag gating.
- **Phase 5 — Polish & ops**: hardening, backups, metrics, tests, docs.

## Security & privacy

- Secrets live in `.env` only — never committed. See `.env.example`.
- Minimal OAuth scopes; `MANAGE_GUILD` is re-verified server-side on every
  dashboard read/write.
- Every input is zod-validated; Prisma only (no raw SQL string-building).
- Message-content storage is opt-in and minimal; logs auto-purge on a schedule.
- Every config change is recorded in the dashboard audit log.

## License

TBD.
