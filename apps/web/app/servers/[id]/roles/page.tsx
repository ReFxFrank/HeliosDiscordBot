import { prisma } from '@refx/database';
import type { RolePanelOption } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { RolePanels, type PanelSummary } from '../../../../components/role-panels';

export const dynamic = 'force-dynamic';

export default async function RolesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [rows, { roles, channels }] = await Promise.all([
    prisma.reactionRolePanel.findMany({
      where: { guildId: id },
      orderBy: { createdAt: 'desc' },
    }),
    getGuildEntities(id),
  ]);
  const panels: PanelSummary[] = rows.map((panel) => ({
    id: panel.id,
    title: panel.title,
    mode: panel.mode,
    type: panel.type,
    channelId: panel.channelId,
    messageId: panel.messageId,
    optionCount: (panel.options as RolePanelOption[]).length,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Self-assignable roles</h2>
        <p className="text-sm text-white/50">
          Button and select-menu role panels. Creating a panel deploys it to the channel.
        </p>
      </div>
      <RolePanels guildId={id} panels={panels} roles={roles} channels={channels} />
    </div>
  );
}
