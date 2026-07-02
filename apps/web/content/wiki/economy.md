# Economy

A per-server currency with income, gambling, robbing, and a role shop. A Premium module.

## Settings

Dashboard → **Economy**:

| Section | Settings |
| --- | --- |
| Currency | Name, symbol, starting balance |
| Income | `/daily` amount, `/work` range + cooldown, **income roles** (per-role daily bonuses) |
| Rob | Enable/disable, success rate %, cooldown, fine % paid to the victim on failure |
| Shop | Sell **roles** for currency — name, price, description per item |
| Gambling & Casino | Global max bet + a link to the [Casino](/docs/casino) page |

## Member commands

| Command | What it does |
| --- | --- |
| `/balance`, `/rich` | Your balance · the wealth leaderboard |
| `/daily`, `/work` | Earn currency (income roles boost `/daily`) |
| `/vote` | Vote for the bot on top.gg and claim a reward (doubled on weekends) |
| `/bank` | Deposit/withdraw — banked coins are safe from `/rob` |
| `/pay user amount` | Send currency |
| `/rob user` | Try to steal from a wallet — risky |
| `/shop`, `/buy item` | Browse and buy shop items |

## Admin commands

| Command | What it does |
| --- | --- |
| `/add-money`, `/remove-money`, `/set-money` | Adjust a member's cash or bank |
| `/economy-reset confirm:true` | Wipe every balance on the server |
