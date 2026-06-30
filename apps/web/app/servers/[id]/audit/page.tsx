import { prisma } from '@helios/database';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const entries = await prisma.dashboardAuditLog.findMany({
    where: { guildId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Audit log</h2>
        <p className="text-sm text-white/50">Every dashboard change, most recent first.</p>
      </div>

      {entries.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-white/40">
          No changes recorded yet.
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-white/5 p-0">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
            >
              <span className="font-medium text-white/85">{entry.action}</span>
              {entry.module && (
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white/50">
                  {entry.module}
                </span>
              )}
              <span className="font-mono text-xs text-white/40">by {entry.userId}</span>
              <span className="ml-auto text-xs text-white/30">
                {entry.createdAt.toISOString().replace('T', ' ').slice(0, 16)}
              </span>
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
