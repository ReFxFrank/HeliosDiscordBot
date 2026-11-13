import { prisma } from '@refx/database';
import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { CountersEditor } from '../../../../../components/twitch/data-editors';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchCountersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  const rows = await prisma.twitchCounter.findMany({
    where: { guildId: id },
    orderBy: { name: 'asc' },
  });
  const names = new Map(config.commands.map((c) => [`cmd:${c.id}`, `cmd:!${c.name}`]));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Counters">
        Named counters for things like deaths or wins. In chat: !count deaths, !count deaths +1, -1,
        =10 or reset. In responses: $(count deaths) adds one, $(getcount deaths) just shows it.
      </PageHeader>
      <CountersEditor
        guildId={id}
        counters={rows.map((r) => ({
          name: r.name,
          label: names.get(r.name) ?? r.name,
          value: r.value,
        }))}
      />
    </div>
  );
}
