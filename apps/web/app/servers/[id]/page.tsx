import { prisma } from '@helios/database';
import type { Module } from '@helios/shared';
import { guardGuildAccess } from '../../../lib/auth-guards';
import { MODULE_META } from '../../../lib/modules';
import { ModuleCard } from '../../../components/module-card';
import { GlassCard } from '../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [guild, configs, caseCount, recentCases] = await Promise.all([
    prisma.guild.findUnique({ where: { id } }),
    prisma.guildModuleConfig.findMany({
      where: { guildId: id },
      select: { module: true, enabled: true },
    }),
    prisma.moderationCase.count({ where: { guildId: id } }),
    prisma.moderationCase.findMany({
      where: { guildId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { caseNumber: true, type: true, targetId: true, createdAt: true },
    }),
  ]);

  const enabledByModule = new Map<Module, boolean>(configs.map((c) => [c.module, c.enabled]));
  const enabledCount = configs.filter((c) => c.enabled).length;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Members" value={(guild?.memberCount ?? 0).toLocaleString()} />
        <Stat label="Mod cases" value={caseCount.toLocaleString()} />
        <Stat label="Modules on" value={`${enabledCount} / ${MODULE_META.length}`} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/80">Modules</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_META.map((meta) => (
            <ModuleCard
              key={meta.module}
              guildId={id}
              meta={meta}
              enabled={enabledByModule.get(meta.module) ?? false}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/80">Recent moderation</h2>
        <GlassCard className="divide-y divide-white/5 p-0">
          {recentCases.length === 0 ? (
            <p className="p-4 text-sm text-white/40">No moderation cases yet.</p>
          ) : (
            recentCases.map((c) => (
              <div
                key={c.caseNumber}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="font-mono text-white/40">#{c.caseNumber}</span>
                <span className="font-medium text-white/80">{c.type}</span>
                <span className="font-mono text-white/50">{c.targetId}</span>
                <span className="text-xs text-white/30">
                  {c.createdAt.toISOString().slice(0, 10)}
                </span>
              </div>
            ))
          )}
        </GlassCard>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-white/90">{value}</p>
    </GlassCard>
  );
}
