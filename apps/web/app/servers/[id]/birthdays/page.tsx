import { prisma } from '@solari/database';
import { birthdaysConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { BirthdaysForm } from '../../../../components/birthdays-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function BirthdaysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, count, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'BIRTHDAYS' } },
      select: { config: true },
    }),
    prisma.birthday.count({ where: { guildId: id } }),
    getGuildEntities(id),
  ]);
  const initial = birthdaysConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Birthdays</h2>
        <p className="text-sm text-white/50">
          Members set theirs with <code className="font-mono">/birthday set</code>.{' '}
          <span className="font-mono text-white/40">{count} saved</span>
        </p>
      </div>
      <GlassCard className="p-5">
        <BirthdaysForm guildId={id} initial={initial} roles={roles} channels={channels} />
      </GlassCard>
    </div>
  );
}
