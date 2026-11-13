import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { FiltersEditor } from '../../../../../components/twitch/filters-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchFiltersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Spam Filters">
        Twelve filters that delete, time out or ban spam automatically, with a warning first if you
        like. Every hit shows up in Logs.
      </PageHeader>
      <FiltersEditor guildId={id} config={config} />
    </div>
  );
}
