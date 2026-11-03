import { prisma } from '@refx/database';
import { pollsConfigSchema } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { PollsForm } from '../../../../components/polls-form';

export const dynamic = 'force-dynamic';

export default async function PollsConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId: id, module: 'POLLS' } },
    select: { config: true },
  });
  const initial = pollsConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Polls</h2>
        <p className="text-sm text-white/50">
          Appearance and defaults for <span className="font-mono text-white/40">/poll</span>. Saved
          changes reach the bot in ~1s.
        </p>
      </div>
      <PollsForm guildId={id} initial={initial} />
    </div>
  );
}
