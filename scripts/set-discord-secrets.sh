#!/usr/bin/env bash
#
# Prompt for the Discord bot token and OAuth client secret (input hidden) and
# write them into /opt/refx-bot/.env, so they never pass through chat logs or
# shell history. Run it from your PC:
#
#   ssh -t rallyforge-staging-admin bash /opt/refx-bot/scripts/set-discord-secrets.sh
#
# Leave a prompt empty to keep the current value.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/refx-bot/.env}"
[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE"; exit 1; }

set_var() {
  local name="$1" value="$2" tmp
  tmp="$(mktemp)"
  # Rewrite the one line; awk avoids sed's trouble with / and & in secrets.
  awk -v n="$name" -v v="$value" 'BEGIN{done=0} index($0, n "=")==1 {print n "=" v; done=1; next} {print} END{if(!done) print n "=" v}' \
    "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

read -rsp 'Bot token (Bot tab → Reset Token): ' token; echo
read -rsp 'Client secret (OAuth2 tab → Reset Secret): ' secret; echo

[ -n "$token" ] && set_var DISCORD_TOKEN "$token" && echo "DISCORD_TOKEN saved"
[ -n "$secret" ] && set_var DISCORD_CLIENT_SECRET "$secret" && echo "DISCORD_CLIENT_SECRET saved"
chmod 600 "$ENV_FILE"
echo "Done. Tell Claude to continue."
