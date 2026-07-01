# Polls

Button-vote polls with live results and optional auto-close.

## Commands

| Command | What it does |
| --- | --- |
| `/poll create question options [duration]` | Post a poll — options separated by `\|` (2–10), duration like `1h`, `2d` (max 14 days) |
| `/poll end id` | Close a poll now |

Members vote by clicking the lettered buttons; results render as live percentage bars. Re-voting replaces a member's previous choice.

## Settings

Dashboard → **Polls**:

| Setting | What it does |
| --- | --- |
| Embed color | The accent color for poll embeds |
| Default auto-close | Applied when `/poll create` is run without a duration (0 = stay open) |
