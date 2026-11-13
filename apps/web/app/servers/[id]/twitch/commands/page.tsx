import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { CommandsEditor } from '../../../../../components/twitch/commands-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchCommandsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Commands">
        Custom !commands. Mods can also manage them from chat: !addcmd, !editcmd, !delcmd and !cmd
        (alias, cooldown, level). Options like -ul=mod -cd=30 -type=reply work there too.{' '}
        <a
          href={`/commands/${id}`}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--color-brand-bright)] hover:underline"
        >
          Public command list ↗
        </a>
      </PageHeader>
      <CommandsEditor guildId={id} config={config} />
    </div>
  );
}
