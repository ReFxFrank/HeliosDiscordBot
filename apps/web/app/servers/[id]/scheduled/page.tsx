import { prisma } from '@solari/database';
import type { ScheduleRepeat } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import {
  ScheduledMessages,
  type ScheduledSummary,
} from '../../../../components/scheduled-messages';

export const dynamic = 'force-dynamic';

export default async function ScheduledPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [rows, { roles, channels }] = await Promise.all([
    prisma.scheduledMessage.findMany({
      where: { guildId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    getGuildEntities(id),
  ]);
  const messages: ScheduledSummary[] = rows.map((message) => ({
    id: message.id,
    name: message.name,
    channelId: message.channelId,
    content: message.content,
    repeat: message.repeat as ScheduleRepeat,
    nextRunAt: message.nextRunAt.toISOString(),
    enabled: message.enabled,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Scheduled messages</h2>
        <p className="text-sm text-white/50">
          One-off or recurring announcements posted by the bot — durable across restarts.
        </p>
      </div>
      <ScheduledMessages guildId={id} messages={messages} roles={roles} channels={channels} />
    </div>
  );
}
