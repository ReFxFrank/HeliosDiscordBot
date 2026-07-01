# FAQ

## The bot isn't responding to a command

Check these in order:

1. **Is the module enabled?** Commands belong to modules — `/warn` needs Moderation enabled on the Overview grid.
2. **Is the command toggled off?** Check the **Slash Commands** page — disabled commands refuse everyone.
3. **Does the member have permission?** Moderation commands respect Discord permissions plus your configured mod/admin roles.
4. **Is it a Premium module?** Economy, Music, Social Alerts, Temp Voice, and ReFx Alerts need [Premium](/docs/premium).

## How do I disable a single command?

Dashboard → your server → **Slash Commands** → flip the switch. It applies within a second.

## Why can't the bot assign a role?

Discord only lets a bot manage roles **below its own highest role**. Drag the Solari role above the roles it needs to hand out, and make sure it has **Manage Roles**.

## Who can use the dashboard for my server?

Anyone with **Manage Server** (or Administrator) on that Discord server. Billing details are the exception — they're visible only to the member who purchased Premium.

## What data does Solari store?

Configuration, moderation cases, XP/levels, economy balances, and similar per-server records — see the [Privacy Policy](/privacy) and [Terms of Service](/terms). Server admins can reset module data (for example `/achievements-reset`, `/economy-reset`).

## Does Premium cover all my servers?

Premium is **per server** — it unlocks the premium modules on the specific server you upgrade. See [Solari Premium](/docs/premium).
