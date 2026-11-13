import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { TimersEditor } from '../../../../../components/twitch/timers-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchTimersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Timers">
        Messages posted on a schedule, with separate intervals for live and offline. A turn is
        skipped when chat has been too quiet.
      </PageHeader>
      <TimersEditor guildId={id} config={config} />
    </div>
  );
}
