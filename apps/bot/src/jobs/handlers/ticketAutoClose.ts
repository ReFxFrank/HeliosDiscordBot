import type { TicketAutoCloseJob } from '@refx/jobs';
import { QUEUE_NAMES } from '@refx/jobs';
import { prisma } from '@refx/database';
import { closeTicket, getTicketsConfig } from '../../modules/tickets';
import { ticketJobId, type JobContext } from '../../services/jobs';

const HOUR_MS = 3_600_000;

export async function handleTicketAutoClose(
  data: TicketAutoCloseJob,
  ctx: JobContext,
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: data.ticketId } });
  if (!ticket || ticket.status !== 'OPEN') return;

  const config = await getTicketsConfig(ticket.guildId);
  if (config.autoCloseHours <= 0) return;

  const thresholdMs = config.autoCloseHours * HOUR_MS;
  const idleMs = Date.now() - ticket.lastActivityAt.getTime();
  if (idleMs >= thresholdMs - 1000) {
    await closeTicket(
      ticket.channelId,
      ctx.client.user?.id ?? ticket.openerId,
      ctx,
      `No activity for ${config.autoCloseHours} hours.`,
    );
  } else {
    // Activity reset the clock since this job was armed — re-arm for what's left.
    await ctx.jobs.schedule(
      QUEUE_NAMES.ticketAutoClose,
      'ticketAutoClose',
      { ticketId: ticket.id },
      { delayMs: thresholdMs - idleMs, jobId: ticketJobId(ticket.id) },
    );
  }
}
