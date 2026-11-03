import Link from 'next/link';
import { ArrowLeft, ExternalLink, Trophy } from 'lucide-react';
import { prisma } from '@refx/database';
import { levelingConfigSchema } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { LeaderboardList, type LeaderboardRow } from '../../../../components/leaderboard-list';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { guilds } = await guardGuildAccess(id);
  const guildName = guilds.find((g) => g.id === id)?.name ?? 'Server';

  const [rows, configRow] = await Promise.all([
    prisma.userLevel.findMany({
      where: { guildId: id },
      orderBy: { xp: 'desc' },
      take: 100,
      select: { userId: true, xp: true, username: true, avatar: true, messages: true, voiceMinutes: true },
    }),
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'LEVELING' } },
      select: { config: true },
    }),
  ]);
  const isPublic = levelingConfigSchema.parse(configRow?.config ?? {}).publicLeaderboard;
  // Cast: the generated client picks up username/avatar after `prisma generate`.
  const leaderboard = rows as unknown as LeaderboardRow[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white/90">
            <Trophy className="h-5 w-5 text-[var(--color-gold)]" /> {guildName} Leaderboard
          </h2>
          <p className="text-sm text-white/50">Ranked by total XP earned. Top 100 members.</p>
        </div>
        <div className="flex items-center gap-2">
          {isPublic && (
            <a
              href={`/leaderboard/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
            >
              <ExternalLink className="h-4 w-4" /> Public page
            </a>
          )}
          <Link
            href={`/servers/${id}/leveling`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
          >
            <ArrowLeft className="h-4 w-4" /> Leveling
          </Link>
        </div>
      </div>

      <LeaderboardList rows={leaderboard} />
    </div>
  );
}
