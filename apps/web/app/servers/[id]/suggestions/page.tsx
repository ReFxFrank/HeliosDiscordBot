import { prisma } from '@helios/database';
import { suggestionsConfigSchema } from '@helios/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { SuggestionsForm } from '../../../../components/suggestions-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function SuggestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, pending] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'SUGGESTIONS' } },
      select: { config: true },
    }),
    prisma.suggestion.count({ where: { guildId: id, status: 'PENDING' } }),
  ]);
  const initial = suggestionsConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Suggestions</h2>
        <p className="text-sm text-white/50">
          Members submit with <code className="font-mono">/suggest</code>; staff triage with{' '}
          <code className="font-mono">/suggestion</code>.{' '}
          <span className="font-mono text-white/40">{pending} pending</span>
        </p>
      </div>
      <GlassCard className="p-5">
        <SuggestionsForm guildId={id} initial={initial} />
      </GlassCard>
    </div>
  );
}
