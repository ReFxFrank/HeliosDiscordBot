import { broadcasterConnected, loadTwitchPage } from '../../../../../lib/twitch-page';
import { AlertsEditor } from '../../../../../components/twitch/alerts-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchAlertsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Chat Alerts">
        Messages the bot posts in chat when things happen: subs, gifts, bits, raids, follows, going
        live and more. Ones marked “needs broadcaster” work once the streamer connects on Overview.
      </PageHeader>
      <AlertsEditor
        guildId={id}
        config={config}
        broadcasterConnected={await broadcasterConnected(config.channel)}
      />
    </div>
  );
}
