'use server';

import { prisma } from '@refx/database';
import { ticketsConfigSchema } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { publishLiveCommand } from './redis';

export interface TicketsActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Deploy the "open a ticket" panel to the configured channel. The bot owns the
 * actual posting; this just publishes the live command after re-checking access
 * and that a panel channel is set.
 */
export async function deployTicketPanel(guildId: string): Promise<TicketsActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TICKETS' } },
    select: { config: true },
  });
  const config = ticketsConfigSchema.parse(row?.config ?? {});
  if (!config.panelChannelId) {
    return { ok: false, error: 'Set a panel channel and save before deploying.' };
  }

  await publishLiveCommand(guildId, 'DEPLOY_TICKET_PANEL', { channelId: config.panelChannelId });
  return { ok: true };
}
