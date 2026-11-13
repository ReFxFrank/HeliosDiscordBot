# ReFx Assistant

The Discord bot and dashboard for **ReFx Roleplay**, a FiveM city on the ReFx
framework. It replaces the patchwork of bots the server used (MEE6, Appy, The
Manager, AuthGG and the txAdmin status embed) with one self-hosted bot, all of
it configured from a web dashboard.

## What it does

| Area | Replaces | Where |
| --- | --- | --- |
| **FiveM City:** live status panel in #connect (online, players x/max, F8 connect, uptime, next restart, Connect + Players buttons), `/status`, `/players`, a "42/128 in the city" presence, up/down alerts and restart warnings in #server-status | txAdmin embed | Dashboard → FiveM City |
| **Whitelist:** players need a whitelisted Discord role to connect, checked live by the `refx_whitelist` resource | — | FiveM City → Whitelist, `fivem/refx_whitelist` |
| Welcome embed in #arrivals, boost thanks in #boosts | MEE6 | Welcome |
| Join/leave and message logs, invite logs | MEE6 | Logging, Invite Tracking |
| Notification role buttons in #roles | MEE6 | Reaction Roles |
| Leveling, `/rank`, `/leaderboard` | The Manager | Leveling |
| Staff / business / faction / dev / CC applications with approve/deny | Appy | Applications |
| Tickets with transcripts to #ticket-logs | The Manager | Tickets |
| Button or captcha verification in #verify | AuthGG | Verification |

There's also moderation and automod, giveaways, polls, suggestions, reminders,
scheduled messages, starboard, birthdays, stats counters, temp voice, social
alerts (Twitch, YouTube, TikTok, Reddit, Bluesky, RSS), custom commands and the embed
builder.

`/refx-setup` points every module at the ReFx channels and roles (found by
name) and creates the five application forms and the role panel. It only
writes config and never posts anything, so it's safe to re-run.

## Layout

```
apps/bot        discord.js v14 bot (sharded; one shard for one server)
apps/web        Next.js 15 dashboard (Discord login)
packages/shared zod config schemas, enums, Redis contracts (bot ↔ dashboard)
packages/database  Prisma schema + migrations (PostgreSQL 16)
packages/jobs   BullMQ queue contracts (Redis 7)
fivem/refx_whitelist  FiveM resource for the Discord-role whitelist
```

The dashboard writes config to Postgres and publishes on Redis. The bot reloads
it in under a second, with no restart. The bot writes each FiveM poll to Redis,
so `/status`, `/players` and the dashboard all show the same snapshot.

## Run it locally

```bash
corepack enable            # or: npx -y pnpm@10.33.0 <cmd>
pnpm install
cp .env.example .env       # fill in the Discord app + AUTH_SECRET
docker compose up -d       # Postgres + Redis
pnpm db:deploy
pnpm deploy:commands
pnpm dev                   # bot + dashboard on http://localhost:3000
```

## Deploy

See [SETUP.md](SETUP.md): Docker Compose on the VPS, the Cloudflare Tunnel
(`bot.refx.gg` for the dashboard, `bot-api.refx.gg` for the whitelist API),
the Discord application, and installing `refx_whitelist` on the game server.

## Checks

```bash
pnpm typecheck   # or per package: (cd apps/bot && npx tsc --noEmit)
pnpm lint
pnpm test        # integration tests need the Postgres + Redis from docker compose
```
