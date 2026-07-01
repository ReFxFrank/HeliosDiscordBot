import { prisma } from '@solari/database';
import { economyConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { CasinoForm } from '../../../../components/casino-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function CasinoConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  // Casino settings live inside the ECONOMY config (the games spend its currency).
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId: id, module: 'ECONOMY' } },
    select: { config: true },
  });
  const initial = economyConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Casino</h2>
        <p className="text-sm text-white/50">
          Enable games, set bet limits, and tune payouts. Games use your Economy currency, so make
          sure the Economy module is on. Saved changes reach the bot in ~1s.
        </p>
      </div>
      <GlassCard className="p-5">
        <CasinoForm guildId={id} initial={initial} />
      </GlassCard>
    </div>
  );
}
