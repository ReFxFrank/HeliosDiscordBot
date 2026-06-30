import { prisma } from '@helios/database';
import { automodConfigSchema } from '@helios/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { AutomodForm } from '../../../../components/automod-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function AutomodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId: id, module: 'AUTOMOD' } },
    select: { config: true },
  });
  const initial = automodConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Auto-moderation</h2>
        <p className="text-sm text-white/50">
          Filter messages for invites, links, spam, mass mentions, caps, and blocked words.
        </p>
      </div>
      <GlassCard className="p-5">
        <AutomodForm guildId={id} initial={initial} />
      </GlassCard>
    </div>
  );
}
