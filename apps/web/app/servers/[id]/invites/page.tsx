import { prisma } from '@solari/database';
import { inviteTrackingConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { InviteTrackingForm } from '../../../../components/invite-tracking-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function InvitesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, tracked, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'INVITE_TRACKING' } },
      select: { config: true },
    }),
    prisma.inviteUse.count({ where: { guildId: id, inviterId: { not: null } } }),
    getGuildEntities(id),
  ]);
  const initial = inviteTrackingConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Invite tracking</h2>
        <p className="text-sm text-white/50">
          See who invited whom and a leaderboard via <code className="font-mono">/invites</code>.{' '}
          <span className="font-mono text-white/40">{tracked} attributed</span>
        </p>
      </div>
      <GlassCard className="p-5">
        <InviteTrackingForm guildId={id} initial={initial} roles={roles} channels={channels} />
      </GlassCard>
    </div>
  );
}
