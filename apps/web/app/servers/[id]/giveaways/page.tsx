import { prisma } from '@refx/database';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { GiveawaysList, type GiveawaySummary } from '../../../../components/giveaways-list';

export const dynamic = 'force-dynamic';

export default async function GiveawaysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const rows = await prisma.giveaway.findMany({
    where: { guildId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { entries: true } } },
  });
  const giveaways: GiveawaySummary[] = rows.map((giveaway) => ({
    id: giveaway.id,
    prize: giveaway.prize,
    winnerCount: giveaway.winnerCount,
    entryCount: giveaway._count.entries,
    ended: giveaway.ended,
    endsAt: giveaway.endsAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Giveaways</h2>
        <p className="text-sm text-white/50">
          Start giveaways in Discord; end or reroll them here.
        </p>
      </div>
      <GiveawaysList guildId={id} giveaways={giveaways} />
    </div>
  );
}
