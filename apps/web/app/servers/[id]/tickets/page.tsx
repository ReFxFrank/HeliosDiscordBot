import { prisma } from '@solari/database';
import { ticketsConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { TicketsForm } from '../../../../components/tickets-form';

export const dynamic = 'force-dynamic';

export default async function TicketsConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, openCount, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'TICKETS' } },
      select: { config: true },
    }),
    prisma.ticket.count({ where: { guildId: id, status: 'OPEN' } }),
    getGuildEntities(id),
  ]);
  const initial = ticketsConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Tickets</h2>
        <p className="text-sm text-white/50">
          Private support channels with transcripts and inactivity auto-close.{' '}
          <span className="font-mono text-white/40">{openCount} open</span>
        </p>
      </div>
      <TicketsForm guildId={id} initial={initial} roles={roles} channels={channels} />
    </div>
  );
}
