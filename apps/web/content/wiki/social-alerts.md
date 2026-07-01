# Social Alerts

Post automatically when creators go live or publish — **Twitch, YouTube, Reddit, Bluesky, and any RSS/Atom feed**. A Premium module.

## Adding an alert

Use `/social add`:

| Platform | Target | Fires on |
| --- | --- | --- |
| Twitch | Channel login | Going live |
| YouTube | Channel id (`UC…`) | New videos |
| Reddit | Subreddit | New posts |
| Bluesky | Handle (`name.bsky.social`) | New posts (reposts skipped) |
| RSS / Atom | Feed URL | New items |

Pick the channel alerts post to and an optional role to ping. Sources are checked every few minutes, and adding a source never dumps its backlog — only new items alert.

## Commands

| Command | What it does |
| --- | --- |
| `/social add platform target [channel] [mention]` | Watch a source |
| `/social list` | This server's alerts |
| `/social remove id` | Remove one |

> Twitch requires the bot host to have Twitch API credentials configured; every other platform works out of the box.
