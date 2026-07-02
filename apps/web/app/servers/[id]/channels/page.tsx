import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildChannels } from '../../../../lib/discord-guild';
import { ChannelManager } from '../../../../components/channel-manager';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);
  const channels = await getGuildChannels(id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Channels</h2>
        <p className="text-sm text-white/50">
          Select channels and delete them in bulk — handy for cleaning up after a raid or a
          template import. Deletions are permanent. Deleting a category leaves its channels in
          place (just uncategorized). Requires the bot to have{' '}
          <span className="text-white/70">Manage Channels</span>.
        </p>
      </div>
      <ChannelManager guildId={id} channels={channels} />
    </div>
  );
}
