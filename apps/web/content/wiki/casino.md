# Casino

Classic casino games played with [Economy](/docs/economy) currency, each with a rich interactive UI. Part of the Economy module (Premium).

## Games

| Command | Game |
| --- | --- |
| `/blackjack bet` | Hit / Stand / Double Down / Split against the dealer — naturals pay 3:2 |
| `/blackjack-table bet` | Multiplayer — up to 6 members join one table, splits included, one dealer |
| `/roulette bet choice` | Red/black/green or ranges |
| `/slots bet` | Three reels — triples and pairs pay out |
| `/dice bet` | Roll two dice against the house, highest total wins |
| `/coinflip bet call` | Double or nothing |

## Settings

Dashboard → **Casino**:

- **Per-game switches** — turn any game off individually.
- **Min / max bet** for all games.
- **Payout tuning** — slots triple/pair multipliers and the blackjack natural multiplier.

> All bets settle atomically — a crash mid-game can never take a stake without paying a win.
