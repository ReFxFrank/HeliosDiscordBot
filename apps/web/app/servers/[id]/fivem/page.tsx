import { prisma } from '@refx/database';
import { notFound } from 'next/navigation';
import { FEATURES, fivemConfigSchema } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { readFivemSnapshot } from '../../../../lib/fivem-status';
import { FivemForm } from '../../../../components/fivem-form';
import { FivemStatusCard } from '../../../../components/fivem-status-card';

export const dynamic = 'force-dynamic';

export default async function FivemConfigPage({ params }: { params: Promise<{ id: string }> }) {
  if (!FEATURES.fivem) notFound();
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, { roles, channels }, status] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'FIVEM' } },
      select: { config: true, enabled: true },
    }),
    getGuildEntities(id),
    readFivemSnapshot(id),
  ]);
  const initial = fivemConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">FiveM City</h2>
        <p className="text-sm text-white/50">
          Connect the Discord to the city server: a live status panel, player count presence,
          up/down alerts, restart warnings and the Discord-role whitelist. Saved changes reach the
          bot in ~1s.
        </p>
      </div>
      <FivemStatusCard
        guildId={id}
        config={initial}
        status={status}
        moduleEnabled={row?.enabled ?? false}
        now={new Date().toISOString()}
      />
      <FivemForm guildId={id} initial={initial} roles={roles} channels={channels} />
    </div>
  );
}
