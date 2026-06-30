import { prisma } from '@helios/database';
import { moderationConfigSchema } from '@helios/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { ModerationForm } from '../../../../components/moderation-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function ModerationConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'MODERATION' } },
      select: { config: true },
    }),
    getGuildEntities(id),
  ]);
  const initial = moderationConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Moderation</h2>
        <p className="text-sm text-white/50">
          Roles, logging, and ban behavior. Saved changes reach the bot in ~1s.
        </p>
      </div>
      <GlassCard className="p-5">
        <ModerationForm guildId={id} initial={initial} roles={roles} channels={channels} />
      </GlassCard>
    </div>
  );
}
