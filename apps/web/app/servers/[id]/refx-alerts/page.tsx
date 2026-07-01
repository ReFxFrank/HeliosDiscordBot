import { prisma } from '@solari/database';
import { refxAlertsConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { RefxAlertsForm } from '../../../../components/refx-alerts-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function RefxAlertsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'REFX_ALERTS' } },
      select: { config: true },
    }),
    getGuildEntities(id),
  ]);
  const initial = refxAlertsConfigSchema.parse(row?.config ?? {});
  const base = (process.env.AUTH_URL ?? '').replace(/\/$/, '');
  const webhookUrl = base ? `${base}/api/integrations/refx` : '/api/integrations/refx';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">ReFx Alerts</h2>
        <p className="text-sm text-white/50">
          Post live ReFx Hosting incident and node-status updates to a channel.
        </p>
      </div>

      <GlassCard className="p-5 text-sm text-white/70">
        <p className="mb-2 font-medium text-white/85">One-time operator setup</p>
        <p className="text-white/55">
          In the ReFx panel, register this webhook URL and your shared secret (
          <code className="font-mono">REFX_WEBHOOK_SECRET</code>):
        </p>
        <code className="mt-2 block break-all rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-white/80">
          {webhookUrl}
        </code>
        <p className="mt-2 text-xs text-white/40">
          The receiver verifies every request’s signature and refuses unsigned traffic. Until the
          secret is set it returns 503.
        </p>
      </GlassCard>

      <GlassCard className="p-5">
        <RefxAlertsForm guildId={id} initial={initial} roles={roles} channels={channels} />
      </GlassCard>
    </div>
  );
}
