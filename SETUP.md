# Solari — Setup & Local Testing Guide

This walks you from a fresh clone to a **running bot + dashboard you can test in
your own Discord server**. Every command below is the real one from this repo.

> **What's testable today:** all the core modules — moderation, automod,
> raid/verification, logging, welcome/autoroles, leveling + voice XP + **rank
> cards**, reaction roles, custom commands, starboard, giveaways, polls,
> suggestions, reminders, scheduled messages, tickets, stats counters, invite
> tracking, birthdays, AFK, and the ReFx status integration.
> **Music (`/play`)** is being built right now (Phase 4) — you can start
> Lavalink, but the music commands aren't live yet.

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | **20+** | Pinned to 20 via `.nvmrc`. Run `nvm use` if you use nvm. |
| **pnpm** | **9+** (10.33.0 pinned) | Easiest: `corepack enable` — it auto-provisions the pinned version. |
| **Docker** + **Docker Compose** | recent | Runs Postgres, Redis, and (optionally) Lavalink. |

```bash
corepack enable          # provisions the pinned pnpm
node -v                  # should be 20.x
```

You also need a **Discord application** (next section).

### Windows

Solari runs on Windows — nothing in the stack needs native build tools (the one
native module, `@napi-rs/canvas`, ships Windows prebuilds, and audio is handled
by Lavalink inside Docker).

> ⚠️ **Use PowerShell, Git Bash, or WSL2 — not the legacy Command Prompt
> (`cmd.exe`).** In `cmd`, `#` is not a comment, so pasting a line like
> `corepack enable   # provisions pnpm` fails with `Invalid package manager
> name '#'`. `cmd` also lacks `cp` and `openssl`. PowerShell (`PS C:\...>`)
> understands the `#` comments and aliases `cp`, so the snippets below work
> as written. Node **20 or newer** is fine (24 works).

Two ways to run it:

**WSL2 (recommended).** Install [WSL2](https://learn.microsoft.com/windows/wsl/install)
+ Docker Desktop, and in Docker Desktop enable **Settings → Resources → WSL
Integration** for your distro so `docker` works inside WSL. Then, inside WSL:

- WSL is a **separate Linux system** — your Windows Node isn't visible there, so
  install Node + pnpm inside it:
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  source ~/.bashrc
  nvm install 20          # bundles corepack → pnpm
  corepack enable         # if this errors with EACCES, it's harmless — pnpm
                          # still works via the packageManager pin on install
  ```
- **Clone into your Linux home, not `/mnt/c/...`.** Running from the Windows
  drive (especially a OneDrive-synced folder like Desktop/Documents) is slow and
  OneDrive corrupts `node_modules` mid-install. Do:
  ```bash
  git clone https://github.com/ReFxFrank/HeliosDiscordBot ~/helios
  cd ~/helios
  ```
  Then follow §3 onward (the commands work exactly as written).

**Native Windows (PowerShell + Docker Desktop).** You already have Node — just
two substitutions, and **clone outside OneDrive** (e.g. `C:\dev\helios`) so
OneDrive doesn't fight `node_modules`:

- `openssl` isn't built in — generate `AUTH_SECRET` with Node instead:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- `cp .env.example .env` works in PowerShell (alias) and Git Bash; in `cmd` use
  `copy .env.example .env`.

Docker Desktop must be installed and **running** before the `docker compose`
steps.

---

## 2. Create your Discord application

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab:
   - Click **Reset Token** → copy it → this is `DISCORD_TOKEN`.
   - Scroll to **Privileged Gateway Intents** and enable **both**:
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**
     - (Leave *Presence Intent* **off** — the bot doesn't use it.)
3. **OAuth2** tab:
   - Copy **Client ID** → `DISCORD_CLIENT_ID`.
   - Copy **Client Secret** (Reset if needed) → `DISCORD_CLIENT_SECRET`.
   - Under **Redirects**, add **exactly**:
     ```
     http://localhost:3000/api/auth/callback/discord
     ```
     (This is the dashboard login callback. The path must match exactly — no
     trailing slash.)
4. **Invite the bot** to a test server. Use **OAuth2 → URL Generator**:
   - Scopes: ✅ `bot` ✅ `applications.commands`
   - Bot Permissions: for a test server, **Administrator** is simplest. (For a
     real deployment, grant View Channels, Send Messages, Embed Links, Manage
     Messages, Add/Manage Reactions, Kick/Ban/Timeout Members, Manage Roles,
     Manage Server, Connect/Speak.)
   - Open the generated URL and add the bot to **your** server (you must have
     Manage Server there).

   Quick invite URL (Administrator) — replace `YOUR_CLIENT_ID`:
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot+applications.commands
   ```

> 💡 Get your **server's ID** (right-click the server → Copy Server ID, with
> Developer Mode on). Set it as `DEV_GUILD_ID` so slash commands appear
> **instantly** instead of taking up to an hour to propagate globally.

---

## 3. Install & configure

```bash
pnpm install                 # also generates the Prisma client (postinstall)
cp .env.example .env         # then edit .env (next step)
```

### Fill in `.env`

The bot and dashboard validate their environment on startup (and fail fast with
a readable error if something required is missing). Minimum to fill:

```dotenv
# ── Datastores (defaults match docker-compose; leave as-is for local) ──
DATABASE_URL=postgresql://helios:helios@localhost:5432/helios?schema=public
REDIS_URL=redis://localhost:6379

# ── Discord (from section 2) ──
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_CLIENT_SECRET=your-client-secret      # required by the dashboard
OWNER_IDS=your-discord-user-id                # optional; comma-separated bot owners
DEV_GUILD_ID=your-test-server-id              # optional but recommended (instant commands)

# ── Dashboard auth ──
AUTH_SECRET=                                   # generate: openssl rand -base64 32
AUTH_URL=http://localhost:3000
```

Generate the auth secret:
```bash
openssl rand -base64 32      # paste into AUTH_SECRET
# Windows / no openssl — works anywhere Node is installed:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Required vs optional (so you know what actually matters):**

| Variable | Bot | Dashboard |
|----------|-----|-----------|
| `DATABASE_URL` | ✅ required | ✅ required |
| `REDIS_URL` | ✅ required | ✅ required |
| `DISCORD_TOKEN` | ✅ required | — |
| `DISCORD_CLIENT_ID` | ✅ required | ✅ required |
| `DISCORD_CLIENT_SECRET` | optional | ✅ required |
| `AUTH_SECRET` | — | ✅ required |
| `AUTH_URL` | — | recommended (`http://localhost:3000`) |
| `DEV_GUILD_ID` | optional (instant commands) | — |
| `OWNER_IDS` | optional (bot-owner commands) | optional |
| `ENCRYPTION_KEY`, `METRICS_*`, `REFX_STATUS_*`, `REFX_NODES_URL` | optional (bot only) | — |
| `REFX_WEBHOOK_SECRET` | — | optional (web only) |

> If you set `ENCRYPTION_KEY`, it must be **at least 32 characters**
> (`openssl rand -hex 32`) or startup fails; leaving it unset is fine.

> `DATABASE_URL` and `REDIS_URL` must be **full URLs** (validated as such) — a
> bare `host:port` will be rejected.

---

## 4. Start infrastructure & database

```bash
docker compose up -d         # starts Postgres + Redis only (healthchecked)
pnpm db:deploy               # applies all migrations to the database
```

`docker compose up` starts **only Postgres + Redis** — Lavalink and the app
containers sit behind opt-in profiles, so they don't start here.

---

## 5. Register slash commands

```bash
pnpm deploy:commands
```

- With `DEV_GUILD_ID` set → commands register to that server **instantly**.
- Without it → **global** registration, which can take **up to ~1 hour** to
  appear.

> This is a one-shot script — **re-run it whenever command definitions change.**
> It reads (and validates) the full bot env, so `DATABASE_URL`/`REDIS_URL` must
> be present even though it doesn't connect to them.

---

## 6. Run the bot + dashboard

Run both together with hot reload:

```bash
pnpm dev
```

Or run them in separate terminals (clearer logs while testing):

```bash
pnpm --filter @solari/bot dev     # the bot
pnpm --filter @solari/web dev     # the dashboard
```

- **Bot:** within a few seconds you should see a `Shard ready` log and the bot
  goes online in your server.
- **Dashboard:** open <http://localhost:3000>, click **Sign in with Discord**,
  authorize, and you'll land on **/servers** — the list of servers where you
  have **Manage Server** (or Administrator/ownership). Pick your test server to
  open its config pages.

---

## 7. Try it out

In your server:

- `/help` — confirms the bot is alive and lists commands.
- `/rank` — renders the Canvas rank card (chat for a bit first to earn XP).
- `/ping`, `/userinfo`-style utilities, `/birthday`, `/remind`, `/tag`.
- `/ticket panel`, `/poll`, `/suggest`, `/giveaway start`.
- Moderation: `/ban`, `/purge`, etc. (needs the bot's role above the target).
- Turn on a module in the **dashboard**, save, and watch the bot pick it up
  within ~1 second (e.g. enable **Auto-moderation**, set a blocked word, and
  post it).

On the **dashboard** you can configure every module per-server: moderation,
automod (incl. raid protection + verification), leveling, welcome, tickets,
starboard, giveaways, and more.

---

## 8. (Optional) Music / Lavalink

> Music commands (`/play`, queue, skip…) are **in active development** and not
> wired up yet. You can start Lavalink now to have the backend ready.

```bash
docker compose --profile music up -d lavalink
```

The password chain is automatic: `.env` `LAVALINK_PASSWORD` → the Lavalink
container → the bot. Defaults to `youshallnotpass` everywhere, so it "just
works" locally.

**Heads-up on YouTube:** Lavalink **v4 removed the built-in YouTube source**, so
out of the box only SoundCloud, Bandcamp, Twitch, Vimeo, and direct HTTP URLs
resolve. YouTube needs the `youtube-source` plugin — that config will land
together with the music module.

---

## 9. Running everything in Docker (alternative)

Instead of `pnpm dev` on your host, you can containerize the apps too:

```bash
docker compose --profile apps up --build           # bot + web (+ Postgres/Redis)
docker compose --profile apps --profile music up --build   # ...plus Lavalink
```

The app containers read `.env` and automatically rewrite `DATABASE_URL`,
`REDIS_URL`, and `LAVALINK_HOST` to the internal service names — so your
`localhost` values in `.env` are only used when running on the host.

> Compose does **not** run migrations. After the containers are up (or before),
> apply them from the host with `pnpm db:deploy` (uses the `localhost`
> `DATABASE_URL`). You still need to `pnpm deploy:commands` once.

---

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| **Env validation error on startup** | A required var is missing/invalid. Check the table in §3. `DATABASE_URL`/`REDIS_URL` must be valid URLs. |
| **`deploy:commands` errors about DATABASE_URL/REDIS_URL** | It validates the full bot env even though it doesn't connect — set those two vars. |
| **Slash commands don't appear** | Set `DEV_GUILD_ID` and re-run `pnpm deploy:commands` (global registration is slow, ~1h). |
| **Dashboard redirects you away from a server** | You need **Manage Server** (or Admin/ownership) on it. A newly-granted permission can take up to ~60s to refresh. |
| **OAuth "redirect URI mismatch"** | The portal redirect must be exactly `http://localhost:3000/api/auth/callback/discord`. |
| **Automod / member events don't fire** | Enable **Message Content** + **Server Members** intents in the Developer Portal (§2). |
| **Postgres/Redis connection refused** | `docker compose up -d` and wait for healthy; confirm `DATABASE_URL`/`REDIS_URL` hosts/ports. |
| **Prisma client / type errors** | `pnpm db:generate` (normally automatic via `pnpm install`). |
| **Moderation action fails** | The bot's highest role must be **above** the target's, and it needs the relevant permission. |
| **Caddy fails to start (§11)** | The origin cert must exist at `infra/caddy/certs/origin.pem` + `origin.key`, and ports 80+443 must be free. Check `docker compose logs caddy`; an existing web server on :80/:443 will block it. |
| **Cloudflare "525 / 526" (SSL handshake)** | Origin cert missing or SSL mode set to Full (strict) without a valid origin cert. Confirm the two files exist and re-create the Origin Certificate if needed (§11 step 2). |
| **After going HTTPS, OAuth or Stripe break** | `AUTH_URL` must be the `https://` domain; the Discord redirect + Stripe webhook must point at that same domain (§11 steps 4–5); and Cloudflare Bot Fight Mode / WAF must not block `/api/*`. |

---

## 11. Production deployment (domain + HTTPS via Cloudflare)

Running on a VPS for real, with your domain on **Cloudflare** (proxied / orange
cloud)? This puts the dashboard behind Cloudflare's CDN + DDoS protection with
end-to-end HTTPS, and keeps the whole stack self-restarting on crash or reboot.
[Caddy](https://caddyserver.com) is the origin proxy; it serves a **Cloudflare
Origin Certificate** so you can run SSL/TLS mode **Full (strict)**. (Example
domain below: `solari.gg`.)

**1. DNS — point the domain at the VPS (proxied).** In Cloudflare → DNS, add an
`A` record for `solari.gg` (and a `CNAME` `www` → `solari.gg` if you want) to your
VPS's public IP, with the **orange cloud on** (Proxied). If you have IPv6, add an
`AAAA` too.

**2. Create the Cloudflare Origin Certificate.** Cloudflare → **SSL/TLS → Origin
Server → Create Certificate** (accept the defaults — RSA, `*.solari.gg, solari.gg`,
15-year). Copy the two blocks onto the VPS as:

```
infra/caddy/certs/origin.pem     # the certificate
infra/caddy/certs/origin.key     # the private key  (git-ignored)
```

Then set Cloudflare → **SSL/TLS → Overview → Full (strict)**, and turn on
**Always Use HTTPS** (SSL/TLS → Edge Certificates). (See
`infra/caddy/certs/README.md` for the same steps.)

**3. Open the firewall** for HTTP/HTTPS on the VPS:

```bash
sudo ufw allow 80,443/tcp     # if you use ufw
```

**4. Fill in the production values in `.env`:**

```dotenv
NODE_ENV=production
SOLARI_DOMAIN=solari.gg                  # your domain (no https://)
AUTH_URL=https://solari.gg               # must be the https domain
```

**5. Update Discord + Stripe to the new URL:**

- **Discord** → Developer Portal → your app → OAuth2 → add redirect
  `https://solari.gg/api/auth/callback/discord` (keep the localhost one too if you
  still dev locally).
- **Stripe** → Developers → Webhooks → add endpoint
  `https://solari.gg/api/stripe/webhook`, subscribe to
  `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`. Copy
  the new **signing secret** into `STRIPE_WEBHOOK_SECRET`. (In live mode, also
  swap `STRIPE_SECRET_KEY` / `STRIPE_PREMIUM_PRICE_ID` to their live values.)

**6. Launch the stack.** Pick the edge that fits your VPS.

*Nothing else uses ports 80/443* — let Solari's bundled Caddy own the HTTPS
front door (add `--profile edge`):

```bash
docker compose up -d                                   # Postgres + Redis
pnpm db:deploy                                          # apply migrations (from host)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile apps --profile edge up -d --build          # bot + web + Caddy
docker compose logs -f caddy                           # watch it serve
```

*You already run nginx / another proxy on 80/443* (e.g. other sites on the box):
drop `--profile edge` — the dashboard binds to `127.0.0.1:3000` and your existing
proxy fronts it. See `infra/nginx/solari.gg.conf` for a ready server block.

```bash
docker compose up -d && pnpm db:deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile apps up -d --build                          # bot + web (no Caddy)
# then add solari.gg to nginx (infra/nginx/solari.gg.conf) and reload
```

Add `--profile music` to the `up` command if you want Lavalink too.

Once the edge is serving, `https://solari.gg` is live through Cloudflare. The
dashboard's plaintext `:3000` is bound to localhost only — your edge proxy is the
single public entrypoint. Every service has `restart: unless-stopped`, so the
stack comes back automatically after a reboot or crash. To update after a
`git pull`, re-run the same `up -d --build` command.

> **Keeping it alive across reboots:** Docker's own service must start on boot —
> `sudo systemctl enable docker`. That plus `restart: unless-stopped` is all the
> keep-alive you need; no extra systemd unit required.

> **Cloudflare gotchas:** if Discord login or Stripe webhooks get blocked, check
> **Security → Bots** (turn off "Bot Fight Mode") and make sure no aggressive WAF
> rule matches `/api/*` — Stripe and Discord's callbacks are server-to-server and
> must pass through. Keep proxied Cloudflare caching off for `/api/*` (it is by
> default).

---

## Command cheat-sheet

```bash
corepack enable                  # provision pnpm
pnpm install                     # deps + prisma generate
docker compose up -d             # Postgres + Redis
pnpm db:deploy                   # apply migrations
pnpm deploy:commands             # register slash commands
pnpm dev                         # run bot + dashboard

# handy extras
pnpm db:studio                   # browse the database (Prisma Studio)
pnpm typecheck && pnpm lint && pnpm test
docker compose --profile music up -d lavalink   # Lavalink (music backend)

# production (VPS behind Cloudflare — see §11)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile apps up -d --build
```
