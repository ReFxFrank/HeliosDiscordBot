import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { IntegrationsEditor } from '../../../../../components/twitch/integrations-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchIntegrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Integrations">
        Accounts used by variables in commands, like the latest YouTube video or a League rank.
      </PageHeader>
      <IntegrationsEditor
        guildId={id}
        config={config}
        keys={{
          lastfm: Boolean(process.env.LASTFM_API_KEY),
          riot: Boolean(process.env.RIOT_API_KEY),
          henrik: Boolean(process.env.HENRIKDEV_API_KEY),
        }}
      />
    </div>
  );
}
