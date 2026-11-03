import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { BRAND, levelingConfigSchema } from '@refx/shared';
import { prisma } from '@refx/database';
import { guildIconUrl } from '../../../lib/discord';
import { LeaderboardList, type LeaderboardRow } from '../../../components/leaderboard-list';
import { BrandMark } from '../../../components/ui/brand-mark';

export const dynamic = 'force-dynamic';

async function loadGuild(guildId: string) {
  if (!/^\d{5,25}$/.test(guildId)) return null;
  return prisma.guild.findUnique({
    where: { id: guildId },
    select: { id: true, name: true, icon: true },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ guildId: string }>;
}): Promise<Metadata> {
  const { guildId } = await params;
  const guild = await loadGuild(guildId);
  const name = guild?.name ?? 'Server';
  return {
    title: `${name} Leaderboard`,
    description: `The XP leaderboard for ${name}, powered by ${BRAND.name}.`,
  };
}

export default async function PublicLeaderboardPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await loadGuild(guildId);
  if (!guild) notFound();

  const configRow = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'LEVELING' } },
    select: { config: true },
  });
  const isPublic = levelingConfigSchema.parse(configRow?.config ?? {}).publicLeaderboard;

  const rows: LeaderboardRow[] = isPublic
    ? ((await prisma.userLevel.findMany({
        where: { guildId },
        orderBy: { xp: 'desc' },
        take: 100,
        select: {
          userId: true,
          xp: true,
          username: true,
          avatar: true,
          messages: true,
          voiceMinutes: true,
        },
        // Cast: the generated client gains username/avatar after `prisma generate`.
      })) as unknown as LeaderboardRow[])
    : [];

  const iconUrl = guildIconUrl(guild.id, guild.icon, 128);

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-semibold tracking-tight text-white">
            <BrandMark size={26} />
            {BRAND.name}
          </span>
          <span className="text-sm font-medium text-white/50">{BRAND.community}</span>
        </header>

        {/* Guild banner */}
        <div className="glass flex items-center gap-4 rounded-2xl p-5">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              aria-hidden
              className="h-16 w-16 shrink-0 rounded-2xl ring-1 ring-white/10"
            />
          ) : (
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/5 text-xl font-semibold text-white/60">
              {(guild.name ?? '?').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
              <Trophy className="h-5 w-5 text-[var(--color-gold)]" />
              {guild.name ?? 'Server'} Leaderboard
            </h1>
            <p className="text-sm text-white/50">Ranked by total XP · top 100 members</p>
          </div>
        </div>

        {isPublic ? (
          <LeaderboardList rows={rows} />
        ) : (
          <div className="glass rounded-2xl p-10 text-center text-sm text-white/50">
            This server&apos;s leaderboard is private.
          </div>
        )}

        <footer className="pt-2 text-center text-xs text-white/30">
          Powered by <span className="text-white/50">{BRAND.name}</span>
        </footer>
      </div>
    </div>
  );
}
