import { prisma } from '@refx/database';
import { embedSpecSchema, type EmbedSpec } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildChannels } from '../../../../lib/discord-guild';
import { EmbedsManager, type SavedEmbedDTO } from '../../../../components/embeds-manager';

export const dynamic = 'force-dynamic';

export default async function EmbedsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [rows, channels] = await Promise.all([
    prisma.savedEmbed.findMany({ where: { guildId: id }, orderBy: { updatedAt: 'desc' } }),
    getGuildChannels(id),
  ]);
  const embeds: SavedEmbedDTO[] = rows.map((row) => {
    const parsed = embedSpecSchema.safeParse(row.spec);
    return {
      id: row.id,
      name: row.name,
      content: row.content ?? '',
      spec: (parsed.success ? parsed.data : {}) as EmbedSpec,
      channelId: row.channelId,
      messageId: row.messageId,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Embed Builder</h2>
        <p className="text-sm text-white/50">
          Design rich embeds with a live preview and post them to any channel — rules, read-me,
          FAQs, announcements. Deploying a posted embed again <span className="text-white/70">edits
          the original message in place</span>, so pinned posts stay pinned.
        </p>
      </div>
      <EmbedsManager guildId={id} embeds={embeds} channels={channels} />
    </div>
  );
}
