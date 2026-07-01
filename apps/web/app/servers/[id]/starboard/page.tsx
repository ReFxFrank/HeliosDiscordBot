import { prisma } from '@solari/database';
import { starboardConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { StarboardForm } from '../../../../components/starboard-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function StarboardConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, { channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'STARBOARD' } },
      select: { config: true },
    }),
    getGuildEntities(id),
  ]);
  const initial = starboardConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Starboard</h2>
        <p className="text-sm text-white/50">Highlight messages that reach a star threshold.</p>
      </div>
      <GlassCard className="p-5">
        <StarboardForm guildId={id} initial={initial} channels={channels} />
      </GlassCard>
    </div>
  );
}
