import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { prisma } from '@solari/database';
import { xpProgress } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Discord's default (embed) avatar index for a snowflake — gives each row a colour. */
function defaultAvatar(userId: string): string {
  let index = 0;
  try {
    index = Number((BigInt(userId) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { guilds } = await guardGuildAccess(id);
  const guildName = guilds.find((g) => g.id === id)?.name ?? 'Server';

  const rows = await prisma.userLevel.findMany({
    where: { guildId: id },
    orderBy: { xp: 'desc' },
    take: 100,
    select: { userId: true, xp: true, messages: true, voiceMinutes: true },
  });

  const entries = rows.map((row, index) => {
    const { level, current, needed } = xpProgress(row.xp);
    return {
      ...row,
      rank: index + 1,
      level,
      ratio: needed > 0 ? Math.min(1, current / needed) : 0,
      current,
      needed,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white/90">
            <Trophy className="h-5 w-5 text-[var(--color-premium)]" /> {guildName} Leaderboard
          </h2>
          <p className="text-sm text-white/50">Ranked by total XP earned. Top 100 members.</p>
        </div>
        <Link
          href={`/servers/${id}/leveling`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
        >
          <ArrowLeft className="h-4 w-4" /> Leveling
        </Link>
      </div>

      {entries.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-white/40">
          No XP earned yet — leaderboard fills up as members chat and join voice.
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <GlassCard
              key={entry.userId}
              className={`flex items-center gap-4 p-3 ${
                entry.rank <= 3 ? 'ring-1 ring-[var(--color-premium)]/25' : ''
              }`}
            >
              <div className="w-8 shrink-0 text-center text-lg font-bold">
                {entry.rank <= 3 ? (
                  MEDALS[entry.rank - 1]
                ) : (
                  <span className="text-sm font-mono text-white/40">#{entry.rank}</span>
                )}
              </div>
              <img
                src={defaultAvatar(entry.userId)}
                alt=""
                aria-hidden
                className="h-10 w-10 shrink-0 rounded-full ring-1 ring-white/10"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm text-white/70">{entry.userId}</span>
                  <span className="shrink-0 rounded-full bg-[var(--color-brand)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-brand-bright)]">
                    Level {entry.level}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[var(--color-brand)]"
                    style={{ width: `${Math.round(entry.ratio * 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
                  <span className="font-mono text-white/55">{entry.xp.toLocaleString()} XP</span>
                  <span>{entry.messages.toLocaleString()} msgs</span>
                  <span>{entry.voiceMinutes.toLocaleString()} voice min</span>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
