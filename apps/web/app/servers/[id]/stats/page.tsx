import { prisma } from '@solari/database';
import { statsCountersConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { StatsCountersForm } from '../../../../components/stats-counters-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function StatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, { channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'STATS_COUNTERS' } },
      select: { config: true },
    }),
    getGuildEntities(id),
  ]);
  const initial = statsCountersConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Stats counters</h2>
        <p className="text-sm text-white/50">
          Auto-updating channel names showing live member, boost, role, and channel counts.
        </p>
      </div>
      <GlassCard className="p-5">
        <StatsCountersForm guildId={id} initial={initial} channels={channels} />
      </GlassCard>
    </div>
  );
}
