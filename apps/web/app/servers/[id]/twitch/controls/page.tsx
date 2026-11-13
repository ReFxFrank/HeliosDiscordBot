import { prisma } from '@refx/database';
import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { BotControls } from '../../../../../components/twitch/controls';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchControlsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadTwitchPage(id);
  const [nukes, rollbacks] = await Promise.all([
    prisma.twitchModLog.findMany({
      where: { guildId: id, kind: 'nuke' },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.twitchModLog.findMany({
      where: { guildId: id, kind: 'rollback' },
      select: { detail: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Bot Controls">
        Act in chat right now: nuke a phrase, undo a nuke, say something as the bot or shout someone
        out.
      </PageHeader>
      <BotControls
        guildId={id}
        nukes={nukes.map((n) => {
          const phrase = (n.data as { phrase?: string } | null)?.phrase ?? '';
          return {
            id: n.id,
            detail: n.detail,
            actor: n.actor,
            action: n.action,
            createdAt: n.createdAt.toISOString(),
            undone: rollbacks.some(
              (r) => r.createdAt > n.createdAt && r.detail.includes(`“${phrase}”`),
            ),
          };
        })}
      />
    </div>
  );
}
