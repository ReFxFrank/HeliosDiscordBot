import { xpProgress } from '@refx/shared';

export interface LeaderboardRow {
  userId: string;
  xp: number;
  username: string | null;
  avatar: string | null;
  messages: number;
  voiceMinutes: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Discord's default (embed) avatar for a snowflake — a stable colored fallback. */
function defaultAvatar(userId: string): string {
  let index = 0;
  try {
    index = Number((BigInt(userId) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/** Real avatar (from the cached hash) or a default avatar if none is stored. */
export function memberAvatarUrl(userId: string, avatar: string | null): string {
  if (!avatar) return defaultAvatar(userId);
  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=64`;
}

/** Ranked leaderboard rows with medals, avatars, level badges, and progress bars. */
export function LeaderboardList({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center text-sm text-white/40">
        No XP earned yet — the leaderboard fills up as members chat and join voice.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => {
        const rank = index + 1;
        const { level, current, needed } = xpProgress(row.xp);
        const ratio = needed > 0 ? Math.min(1, current / needed) : 0;
        const name = row.username?.trim() || `User ${row.userId.slice(-4)}`;
        return (
          <div
            key={row.userId}
            className={`glass flex items-center gap-4 rounded-xl p-3 ${
              rank <= 3 ? 'ring-1 ring-[var(--color-gold)]/25' : ''
            }`}
          >
            <div className="w-8 shrink-0 text-center text-lg font-bold">
              {rank <= 3 ? (
                MEDALS[rank - 1]
              ) : (
                <span className="font-mono text-sm text-white/40">#{rank}</span>
              )}
            </div>
            <img
              src={memberAvatarUrl(row.userId, row.avatar)}
              alt=""
              aria-hidden
              className="h-10 w-10 shrink-0 rounded-full ring-1 ring-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-white/90">{name}</span>
                <span className="shrink-0 rounded-full bg-[var(--color-brand)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-brand-bright)]">
                  Level {level}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--color-brand)]"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
                <span className="font-mono text-white/55">{row.xp.toLocaleString()} XP</span>
                <span>{row.messages.toLocaleString()} msgs</span>
                <span>{row.voiceMinutes.toLocaleString()} voice min</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
