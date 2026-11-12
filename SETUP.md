# ReFx Assistant: setup and deployment

ReFx Assistant runs on the staging VPS (`rallyforge-staging-admin`,
15.204.252.217) under Docker Compose in `/opt/refx-bot`. A Cloudflare Tunnel
publishes it, so no inbound port is open on the VPS:

| Hostname | Goes to | What it is |
| --- | --- | --- |
| `https://bot.refx.gg` | `127.0.0.1:3000` | Dashboard |
| `https://bot-api.refx.gg` | `127.0.0.1:30125` | Whitelist API for the `refx_whitelist` resource |

Postgres and Redis listen on the VPS loopback only. Secrets live in
`/opt/refx-bot/.env` (mode 600), generated on the server.

The city itself is **`play.refx.gg`**: a DNS-only (grey cloud) A record in
Cloudflare, since FiveM traffic can't be proxied. The bot polls it and shows
`connect play.refx.gg` in #connect, so the raw IP is never shown. When the city
moves to another machine, change that one A record. Nothing in the bot needs
editing.

## 1. Discord application (once)

1. Go to <https://discord.com/developers/applications>, create **New Application** named
   **ReFx Assistant**, and set the ReFx logo as its icon.
2. **Bot** tab:
   - Reset the token and keep it for step 3.
   - Turn on **Server Members Intent** and **Message Content Intent**.
   - Turn off **Public Bot**.
3. **OAuth2** tab: copy the **Client ID** and **Client Secret**, then add this
   redirect: `https://bot.refx.gg/api/auth/callback/discord`.
4. Put `DISCORD_CLIENT_ID` and your own Discord user id (`OWNER_IDS`) in
   `/opt/refx-bot/.env`. Then store the token and secret with the prompt script.
   Its input is hidden, so the values never land in chat or shell history:

   ```bash
   ssh -t rallyforge-staging-admin bash /opt/refx-bot/scripts/set-discord-secrets.sh
   ```

5. Invite the bot to ReFx. Swap in the client id:
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=8`
   Then drag its role above the roles it hands out: Member, Content Follower,
   Social Updates, and any role rewards.

## 2. Start it

```bash
cd /opt/refx-bot
C="sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile apps"
$C up -d                                                   # postgres, redis, bot, web, backup
$C run --rm bot pnpm --filter @refx/database migrate:deploy # first run / after schema changes
$C run --rm bot pnpm --filter @refx/bot deploy:commands     # register slash commands
$C ps
$C logs -f bot
```

## 3. Point it at the ReFx server

1. In Discord, run **`/refx-setup`**. It links welcome, logging, invites,
   verification, tickets, applications, leveling, moderation and FiveM City to
   the existing channels and roles. It also creates the five application forms
   and the notification-role panel. It doesn't post anything, and it's safe to
   re-run.
2. On the dashboard (<https://bot.refx.gg>), post the panels from these pages:
   Verification (#verify), Tickets (#tickets), Applications (#applications),
   Reaction Roles (#roles). Then on **FiveM City**:
   - set the restart times,
   - check the server address,
   - click **Post new panel** to drop the live status panel into #connect.
3. Once everything checks out, remove the bots it replaces: MEE6, Appy, The
   Manager and AuthGG. Delete the old txAdmin embed in #connect too.

## 4. Whitelist on the game server

The `fivem/refx_whitelist` resource asks the bot on every connect whether the
player holds a whitelisted role. The roles are picked on the dashboard's
FiveM City page.

1. Copy `fivem/refx_whitelist` into the server's `resources/` folder.
2. Get the key:

   ```bash
   ssh rallyforge-staging-admin "sudo grep FIVEM_API_KEY /opt/refx-bot/.env"
   ```

3. Add this to `server.cfg`. Use `set`, not `setr`, so the key never reaches clients:

   ```cfg
   set refx_whitelist_url "https://bot-api.refx.gg"
   set refx_whitelist_key "PASTE_FIVEM_API_KEY"
   set refx_whitelist_failopen "false"
   set refx_whitelist_recheck_minutes "5"
   ensure refx_whitelist
   ```

4. Restart, then turn **Whitelist** on in FiveM City. Until it's on, the API
   lets everyone in, so installing the resource first is safe.

It works alongside the framework's own `queue` whitelist: a player has to pass
both. Players need the Discord desktop app running, so FiveM can see their
`discord:` identifier.

## Cloudflare Tunnel

- Tunnel: `refx-bot`.
- Config: `/etc/cloudflared/refx-bot.yml`.
- Service: `refx-bot-tunnel.service`, running as root.
- DNS: the CNAMEs `bot.refx.gg`, `bot-api.refx.gg` and `hopps.refx.gg` (the Professor Hopps dashboard, port 3001) point at the tunnel
  (created with `cloudflared tunnel route dns`).

```bash
sudo systemctl status refx-bot-tunnel
sudo journalctl -u refx-bot-tunnel -f
```

## Redeploying

From this repo on your PC, ship the working tree and rebuild:

```bash
git ls-files -co --exclude-standard | tar --force-local -czf refx-bot.tgz -T -
scp refx-bot.tgz rallyforge-staging-admin:/home/debian/
ssh rallyforge-staging-admin
```

Then on the VPS:

```bash
cd /opt/refx-bot && find . -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} + \
  && tar -xzf ~/refx-bot.tgz && rm ~/refx-bot.tgz
find . -type f \( -name '*.sh' -o -name '*.ts' -o -name '*.yml' \) -exec sed -i 's/\r$//' {} +
C="sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile apps"
$C up -d --build bot web
$C run --rm bot pnpm --filter @refx/database migrate:deploy
```

Run `deploy:commands` again whenever a slash command is added or renamed.
Once the repo is pushed somewhere, `scripts/redeploy.sh` does the same from a
`git pull`.

## Other instances (Professor Hopps)

The same code runs more than one bot. Each instance has its own folder on the
VPS, its own Discord application, database, Redis and `.env`, and is branded by
that `.env` (`BRAND_NAME`, `BRAND_COMMUNITY`, `BRAND_COLOR`, `BRAND_FOOTER`,
`BRAND_LOGO`, `BRAND_PRESENCE`). `FEATURE_FIVEM=false` hides everything FiveM
(the module, `/status`, `/players`, `/refx-setup`, the whitelist API) and offers
`/community-setup` instead. ReFx Assistant is simply the instance with none of
these set.

| Instance | Folder | Compose project | Dashboard port |
| --- | --- | --- | --- |
| ReFx Assistant | `/opt/refx-bot` | `refx-bot` | 3000 |
| Professor Hopps (Ribbit Retreat) | `/opt/hopps-bot` | `hopps-bot` | 3001 |

A second instance needs `-p <project>` on every compose command, and host ports
that don't collide (`WEB_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `FIVEM_API_PORT`
in its `.env`):

```bash
cd /opt/hopps-bot
C="sudo docker compose -p hopps-bot -f docker-compose.yml -f docker-compose.prod.yml --profile apps"
$C up -d --build
$C run --rm bot pnpm --filter @refx/database migrate:deploy
$C run --rm bot pnpm --filter @refx/bot deploy:commands
```

The dashboard bakes the branding in at build time, so rebuild `web` after
changing a `BRAND_*` value. To set an instance up:

1. Create its Discord application (Bot tab: Server Members and Message Content
   intents on; OAuth2 redirect `https://<dashboard host>/api/auth/callback/discord`)
   and, for go-live alerts, a Twitch developer app (<https://dev.twitch.tv/console/apps>,
   any OAuth redirect such as `http://localhost`, category "Chat Bot").
2. Store the credentials with hidden input:

   ```bash
   ssh -t rallyforge-staging-admin bash /opt/hopps-bot/scripts/set-discord-secrets.sh
   ```

3. Start it (commands above), invite the bot, then run
   `/community-setup twitch:<username>` in the server. It links the modules to
   the channels and roles it finds by name and adds the go-live alert. More
   alerts (YouTube, Reddit, Bluesky, RSS) are on the dashboard's Social Alerts page.

When redeploying, ship the tarball into each instance folder and rebuild each.

## Local development

```bash
npx -y pnpm@10.33.0 install
cp .env.example .env          # Discord app (a separate dev app is fine) + AUTH_SECRET
docker compose up -d          # Postgres + Redis on localhost
npx -y pnpm@10.33.0 db:deploy
npx -y pnpm@10.33.0 deploy:commands
npx -y pnpm@10.33.0 dev       # http://localhost:3000
```

On this Windows PC, turbo won't start, so run the checks per package:
`(cd apps/bot && npx tsc --noEmit)`, `npx eslint .`, `npx vitest run`.
