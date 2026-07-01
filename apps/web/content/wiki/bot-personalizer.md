# Bot Personalizer

Run Solari under **your own bot identity** — your name, your avatar, your presence. A Premium feature.

## How it works

You create a Discord application of your own, and Solari runs it for you with all the same modules and commands. Your community sees *your* bot.

## Setup

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications) → **Bot** tab → copy the token.
2. Dashboard → **Bot Personalizer** → paste the token, set the name, avatar URL, status (online/idle/dnd/invisible), and activity ("Playing …", "Listening …", streaming URL supported).
3. Enable it. Your custom bot comes online within seconds; changes restart it live.

## Security

Your token is encrypted (AES-256-GCM) before it touches the database and is never shown again in the dashboard — you can only replace it.

> Discord rate-limits bot username changes (roughly twice per hour) and usernames must be globally unique.
