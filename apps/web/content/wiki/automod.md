# Auto-Moderation

Automatic message filters and join-gate raid protection.

## Filters

Each filter can be toggled independently and given its own action — **delete**, **warn**, **timeout** (with minutes), **kick**, or **ban**. The offending message is always deleted; the action is the punishment on top.

| Filter | Notes |
| --- | --- |
| Discord invites | Blocks invite links |
| Links | Blocks all links except your allowlisted domains |
| Mass mentions | Trips at your max mentions per message |
| Excessive caps | Percentage threshold with a minimum length |
| Spam | Max messages within a sliding window |
| Blocked words | Whole-word, case-insensitive list |

**Exempt roles/channels** are never filtered, and members with Manage Messages are always exempt.

## Raid protection

Two independent join gates:

- **Account age** — reject accounts younger than N hours (kick, ban, or timeout).
- **Join rate** — if X members join within Y seconds, **raid mode** arms for a cooldown and sanctions the trailing wave too. An alert posts to your chosen channel.
- **Pause invites** — optionally flip Discord's own invites-paused switch while raid mode is armed; it lifts automatically when the window ends.

## Anti-nuke

Protection against a **compromised or rogue mod/admin account** going destructive — separate from raids, which come from outside. Solari counts audit-log actions *per account* in a rolling window:

| Counter | Default |
| --- | --- |
| Bans + kicks | 5 in 60s |
| Channel deletions | 3 in 60s |
| Role deletions | 3 in 60s |

Past a threshold the account is sanctioned — **strip all roles** (default, keeps the account around for investigation), kick, or ban — and an alert posts with what happened. The server owner and Solari itself are always exempt; you can whitelist trusted user/bot IDs. Requires the bot to have **View Audit Log**.

> Looking for the verification gate? It has its own module now — see [Verification](/docs/verification).
