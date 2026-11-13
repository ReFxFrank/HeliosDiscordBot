import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { BlockedTermsEditor } from '../../../../../components/twitch/blocked-terms-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchBlockedTermsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Blocked Terms">
        Words and phrases that are never allowed, matched anywhere in a message, even when disguised
        with lookalike characters. Use * for “any letters”, or tick regex for patterns.
      </PageHeader>
      <BlockedTermsEditor guildId={id} config={config} />
    </div>
  );
}
