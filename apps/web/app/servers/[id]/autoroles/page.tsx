import { prisma } from '@solari/database';
import { autoroleConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { AutoroleForm } from '../../../../components/autorole-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function AutoroleConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, { roles }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'AUTOROLE' } },
      select: { config: true },
    }),
    getGuildEntities(id),
  ]);
  const initial = autoroleConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Autoroles</h2>
        <p className="text-sm text-white/50">Roles automatically granted when a member joins.</p>
      </div>
      <GlassCard className="p-5">
        <AutoroleForm guildId={id} initial={initial} roles={roles} />
      </GlassCard>
    </div>
  );
}
