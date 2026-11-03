import { prisma } from '@refx/database';
import { BRAND, MODULES } from '@refx/shared';
import { guardGuildAccess } from '../../../lib/auth-guards';
import { MODULE_META } from '../../../lib/modules';
import { ModuleGrid } from '../../../components/module-grid';
import { QuickSetup } from '../../../components/quick-setup';
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
  // Kept out of the Promise.all above so the (stale-client) globalModuleFlag
  // type can't degrade the other results to `any`.
  const flagRows = await prisma.globalModuleFlag.findMany({
    where: { enabled: false },
    select: { module: true },
  });

  const disabledModules = (flagRows as { module: string }[]).map((f) => f.module);
  // Plain object so it serializes into the client <ModuleGrid />.
  const enabled: Record<string, boolean> = Object.fromEntries(
    configs.map((c) => [c.module, c.enabled]),
  );
  // Rows for removed legacy modules (dead Prisma enum values) don't count.
  const enabledCount = configs.filter(
    (c) => c.enabled && (MODULES as readonly string[]).includes(c.module),
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-bright)]">
          {BRAND.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white/90">
          {guild?.name ?? id}
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Everything the bot does for {BRAND.community}, in one place.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Members" value={(guild?.memberCount ?? 0).toLocaleString()} />
        <Stat label="Modules on" value={`${enabledCount} / ${MODULE_META.length}`} />
        <Stat label="Mod cases" value={caseCount.toLocaleString()} />
      </section>

      {guild?.setupCompletedAt == null && (
        <QuickSetup guildId={id} guildName={guild?.name ?? 'your server'} />
      )}

      <ModuleGrid
        guildId={id}
        enabled={enabled}
        disabledModules={disabledModules}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/80">Recent moderation</h2>
        <GlassCard className="divide-y divide-white/5 p-0">
          {recentCases.length === 0 ? (
            <p className="p-4 text-sm text-white/40">No moderation cases yet.</p>
          ) : (
            recentCases.map((c) => (
              <div
                key={c.caseNumber}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="font-mono text-white/40">#{c.caseNumber}</span>
                <span className="font-medium text-white/80">{c.type}</span>
                <span className="min-w-0 truncate font-mono text-white/50">{c.targetId}</span>
                <span className="ml-auto text-xs text-white/30">
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
      <p className="mt-1 font-mono text-2xl font-semibold text-white/90">
        {value}
      </p>
    </GlassCard>
  );
}
