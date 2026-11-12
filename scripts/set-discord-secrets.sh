#!/usr/bin/env bash
#
# Prompt for an instance's Discord (and optionally Twitch) credentials and write
# them into its .env. Secret input is hidden, so the values never pass through
# chat logs or shell history. Run it from your PC, naming the instance folder:
#
#   ssh -t rallyforge-staging-admin bash /opt/refx-bot/scripts/set-discord-secrets.sh
#   ssh -t rallyforge-staging-admin bash /opt/hopps-bot/scripts/set-discord-secrets.sh
#
# Leave any prompt empty to keep the current value.
set -euo pipefail

# Default to the .env of the checkout this script lives in.
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/.." && pwd)/.env}"
[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE"; exit 1; }
echo "Updating $ENV_FILE"

set_var() {
  local name="$1" value="$2" tmp
  tmp="$(mktemp)"
  # Rewrite the one line; awk avoids sed's trouble with / and & in secrets.
  awk -v n="$name" -v v="$value" 'BEGIN{done=0} index($0, n "=")==1 {print n "=" v; done=1; next} {print} END{if(!done) print n "=" v}' \
    "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

save() {
  local name="$1" value="$2"
  if [ -n "$value" ]; then set_var "$name" "$value"; echo "  $name saved"; fi
}

read -rp  'Discord application (client) ID: ' client_id
read -rsp 'Discord bot token (Bot tab → Reset Token): ' token; echo
read -rsp 'Discord client secret (OAuth2 tab → Reset Secret): ' secret; echo
read -rp  'Twitch client ID (optional, for go-live alerts): ' twitch_id
read -rsp 'Twitch client secret (optional): ' twitch_secret; echo

save DISCORD_CLIENT_ID "$client_id"
save DISCORD_TOKEN "$token"
save DISCORD_CLIENT_SECRET "$secret"
save TWITCH_CLIENT_ID "$twitch_id"
save TWITCH_CLIENT_SECRET "$twitch_secret"
chmod 600 "$ENV_FILE"
echo "Done. Tell Claude to continue."
