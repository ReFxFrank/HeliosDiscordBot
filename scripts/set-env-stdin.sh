#!/usr/bin/env bash
#
# Set one variable in this checkout's .env from stdin, so a secret can be piped
# in (e.g. from a clipboard) without appearing in a command line, shell history
# or a log:
#
#   <something that prints the value> | ssh host bash /opt/hopps-bot/scripts/set-env-stdin.sh DISCORD_TOKEN
#
# Prints only the variable name and the value's length.
set -euo pipefail

NAME="${1:?usage: set-env-stdin.sh VAR_NAME < value}"
[[ "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "Bad variable name"; exit 1; }
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/.." && pwd)/.env}"
[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE"; exit 1; }

VALUE="$(tr -d '\r\n')"
[ -n "$VALUE" ] || { echo "Empty value; nothing changed"; exit 1; }

tmp="$(mktemp)"
# The value travels in the environment, not in awk's arguments.
VALUE="$VALUE" awk -v n="$NAME" 'BEGIN{done=0} index($0, n "=")==1 {print n "=" ENVIRON["VALUE"]; done=1; next} {print} END{if(!done) print n "=" ENVIRON["VALUE"]}' \
  "$ENV_FILE" > "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
chmod 600 "$ENV_FILE"
echo "$NAME saved (${#VALUE} characters) in $ENV_FILE"
