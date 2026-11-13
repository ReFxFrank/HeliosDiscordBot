import { prisma } from '@refx/database';
import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { DefaultsEditor } from '../../../../../components/twitch/defaults-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchDefaultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  const broadcaster = config.channel
    ? await prisma.twitchAccount.findFirst({
        where: { id: { startsWith: 'broadcaster:' }, login: config.channel },
        select: { id: true },
      })
    : null;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Default Commands">
        Built-in commands. Switch each on or off, choose who can use it and set a cooldown. Mods and
        the broadcaster always skip cooldowns.
      </PageHeader>
      <DefaultsEditor guildId={id} config={config} broadcasterConnected={Boolean(broadcaster)} />
    </div>
  );
}
