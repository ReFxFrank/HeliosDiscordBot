# Welcome & Goodbye

Greet new members with a message, an optional generated **welcome card**, and an optional DM; announce departures too.

## Message variables

Click the chips under each editor to insert variables — the live preview shows exactly how the message renders in Discord:

| Variable | Becomes |
| --- | --- |
| `{user}` | @mention of the member |
| `{user.name}` / `{user.tag}` | Username / full tag |
| `{server}` | Server name |
| `{memberCount}` | Member number |
| `{accountAge}` | Age of their Discord account |

## Sections

| Section | Settings |
| --- | --- |
| Welcome Message | The channel + message posted on join |
| Welcome Card | Attach a generated banner (avatar, name, member #) — custom background image URL supported |
| Direct Message | Optionally DM the member a private greeting |
| Goodbye Message | The channel + message posted when someone leaves |

## Welcome card

When enabled, Solari renders a banner image with the member's avatar and name and attaches it to the welcome message. Provide a background image URL (1024×256 works best) or leave it blank for the default Solari violet gradient.

> Autoroles (roles applied on join) are their own module — see [Autoroles](/docs/autoroles).
