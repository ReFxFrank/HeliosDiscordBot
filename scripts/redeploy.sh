#!/usr/bin/env bash
#
# One-shot ReFx Assistant redeploy: pull the latest code, install deps, apply DB
# migrations, rebuild + restart the bot and dashboard, and re-register slash
# commands — the whole chain that used to be five separate commands.
#
#   pnpm redeploy            # or: bash scripts/redeploy.sh
#
# Notes:
#   * The prod compose file is an OVERLAY, so BOTH -f files are required (this
#     script always passes them, so the "web has no build context" error can't
#     happen). The Cloudflare Tunnel on the host fronts the dashboard and API.
#   * Re-run anytime; every step is idempotent.
set -euo pipefail

# Always operate from the repo root, wherever the script is invoked from.
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile apps)

step() { printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }

step "1/5  Pulling latest code (origin/$BRANCH)"
git fetch origin "$BRANCH"
git pull origin "$BRANCH"

step "2/5  Installing dependencies"
pnpm install

step "3/5  Applying database migrations"
pnpm db:deploy

step "4/5  Rebuilding + restarting bot and web"
"${COMPOSE[@]}" up -d --build --force-recreate bot web

step "5/5  Registering slash commands"
pnpm deploy:commands

printf '\n\033[1;32m✅ ReFx Assistant redeployed from %s.\033[0m\n' "$BRANCH"
