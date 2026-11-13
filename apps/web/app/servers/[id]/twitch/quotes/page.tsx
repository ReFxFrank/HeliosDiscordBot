import { prisma } from '@refx/database';
import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { QuotesEditor } from '../../../../../components/twitch/data-editors';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchQuotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  const quotes = await prisma.twitchQuote.findMany({
    where: { guildId: id },
    orderBy: { number: 'desc' },
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Quotes">
        Memorable lines from stream. In chat: !quote (random), !quote 12, !quote frog (search),
        !quote add, and for mods !quote edit / !quote del.
      </PageHeader>
      <QuotesEditor
        guildId={id}
        config={config}
        quotes={quotes.map((q) => ({
          number: q.number,
          text: q.text,
          game: q.game,
          addedBy: q.addedBy,
          createdAt: q.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
