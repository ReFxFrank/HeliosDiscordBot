# Moderation

Warns, kicks, timeouts, bans, and purges — every action creates a numbered **case** you can review later.

## Setup

Dashboard → **Moderation**. The page is split into sections:

| Section | Settings |
| --- | --- |
| Moderator Roles | Admin roles (full config access) and moderator roles (can use mod commands) |
| Immune Roles | Members with these roles can never be warned, muted, kicked, or banned by Solari |
| Logging & Mute Role | The mod-log channel every case posts to, plus a legacy mute role |
| Ban Behavior | How much recent message history to delete on ban (none → 7 days) |
| Member Notifications | Whether the member is DM'd the reason when actioned |
| Warn Escalation | Automatic punishments at warn thresholds |

## Warn escalation

Build a ladder like *3 warns → 1h timeout, 5 warns → kick*. Each rung fires once, exactly when a member's **active warn count** reaches its threshold.

## Commands

| Command | What it does |
| --- | --- |
| `/warn user reason` | Warn a member (triggers escalation) |
| `/warnings user` | A member's case history and active warn count |
| `/timeout user duration` | Mute via native timeout (`10m`, `2h`, max 28d) |
| `/untimeout user` | Lift a timeout early |
| `/kick user reason` | Kick a member |
| `/ban user [duration] [delete_days]` | Ban — add a duration (`7d`) for an auto-lifting temp-ban |
| `/unban user_id` | Lift a ban |
| `/purge count` | Bulk-delete recent messages |

> Solari refuses to action the server owner, itself, the acting moderator, or anyone holding an immune role.
