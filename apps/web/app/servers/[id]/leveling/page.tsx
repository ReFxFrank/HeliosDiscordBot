import { prisma } from '@solari/database';
import { levelingConfigSchema, xpProgress } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { LevelingForm } from '../../../../components/leveling-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function LevelingConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, top, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'LEVELING' } },
      select: { config: true },
    }),
    prisma.userLevel.findMany({
      where: { guildId: id },
      orderBy: { xp: 'desc' },
      take: 10,
      select: { userId: true, xp: true },
    }),
    getGuildEntities(id),
  ]);
  const initial = levelingConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Leveling / XP</h2>
        <p className="text-sm text-white/50">Text XP, announcements, and role rewards.</p>
      </div>

      <GlassCard className="p-5">
        <LevelingForm guildId={id} initial={initial} roles={roles} channels={channels} />
      </GlassCard>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Top members</h3>
        <GlassCard className="divide-y divide-white/5 p-0">
          {top.length === 0 ? (
            <p className="p-4 text-sm text-white/40">No XP earned yet.</p>
          ) : (
            top.map((entry, index) => {
              const { level } = xpProgress(entry.xp);
              return (
                <div
                  key={entry.userId}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="font-mono text-white/40">#{index + 1}</span>
                  <span className="font-mono text-white/70">{entry.userId}</span>
                  <span className="text-white/80">Level {level}</span>
                  <span className="font-mono text-white/50">{entry.xp.toLocaleString()} XP</span>
                </div>
              );
            })
          )}
        </GlassCard>
      </div>
    </div>
  );
}
