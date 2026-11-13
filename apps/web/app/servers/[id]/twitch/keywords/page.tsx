import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { KeywordsEditor } from '../../../../../components/twitch/keywords-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchKeywordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Keywords">
        Reply when a message contains certain words, without anyone typing a command. Great for
        answering “what game is this?” or “how do I join the Discord?”.
      </PageHeader>
      <KeywordsEditor guildId={id} config={config} />
    </div>
  );
}
