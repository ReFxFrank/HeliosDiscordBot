# The Dashboard

The dashboard at [solari.gg](/) is where everything is configured. This page is a map.

## Layout

- **Server switcher** (top left) — jump between every server you manage. Solari keeps configuration fully separate per server.
- **Server section** — Overview, Settings, Slash Commands, Audit log, and Premium.
- **Module groups** — the sidebar lists every module with a config page, grouped like the overview grid.

## Overview

The landing page for a server: member count, modules enabled, recent moderation cases, and the module grid where you switch modules on and off.

## Settings

Server-wide options:

| Setting | What it does |
| --- | --- |
| Bot master roles | Roles that can administer Solari (Administrator always can) |
| Moderator roles | Roles that can use moderation commands |
| Language | The language Solari replies in |
| Timezone | Used by scheduled actions and timestamps |
| Prefix | For legacy text commands (Solari is slash-first) |

## Slash Commands

Toggle **individual commands** on or off for your server. A disabled command refuses everyone — moderators included — within about a second. See [Command Toggles](/docs/slash-commands).

## Audit log

Every dashboard change — who changed what, and when. Config saves record before/after values.

## Saving

Config pages have a **Save changes** button; the live bot picks the change up in about a second. Fields that reference roles or channels always use synced pickers, never raw IDs.
