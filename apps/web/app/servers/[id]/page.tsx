import { prisma } from '@solari/database';
import { isModuleLocked } from '@solari/shared';
import { guardGuildAccess } from '../../../lib/auth-guards';
import { MODULE_META } from '../../../lib/modules';
import { DashboardHero } from '../../../components/dashboard-hero';
import { ModuleGrid } from '../../../components/module-grid';
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
  const tier = guild?.premiumTier ?? 'FREE';
  const isPremium = tier === 'PREMIUM';
  // Plain object so it serializes into the client <ModuleGrid />.
  const enabled: Record<string, boolean> = Object.fromEntries(
    configs.map((c) => [c.module, c.enabled]),
  );
  // Count only modules the guild can actually use — a premium module left enabled
  // after a downgrade renders as "Locked" in the grid, so it shouldn't inflate this.
  const enabledCount = configs.filter((c) => c.enabled && !isModuleLocked(c.module, tier)).length;

  return (
    <div className="flex flex-col gap-8">
      <DashboardHero guildId={id} isPremium={isPremium} guildName={guild?.name ?? id} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Members" value={(guild?.memberCount ?? 0).toLocaleString()} />
        <Stat label="Modules on" value={`${enabledCount} / ${MODULE_META.length}`} />
        <Stat label="Mod cases" value={caseCount.toLocaleString()} />
        <Stat label="Plan" value={isPremium ? 'Premium' : 'Free'} accent={isPremium} />
      </section>

      <ModuleGrid
        guildId={id}
        enabled={enabled}
        isPremium={isPremium}
        disabledModules={disabledModules}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/80">Recent moderation</h2>
        <GlassCard className="divide-y divide-white/5 p-0">
          {recentCases.length === 0 ? (
            <p className="p-4 text-sm text-white/40">No moderation cases yet.</p>
          ) : (
            recentCases.map((c) => (
              <div key={c.caseNumber} className="flex items-center justify-between px-4 py-3 text-sm">
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

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <GlassCard className="p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p
        className={
          accent
            ? 'mt-1 font-mono text-2xl font-semibold text-[var(--color-premium)]'
            : 'mt-1 font-mono text-2xl font-semibold text-white/90'
        }
      >
        {value}
      </p>
    </GlassCard>
  );
}
