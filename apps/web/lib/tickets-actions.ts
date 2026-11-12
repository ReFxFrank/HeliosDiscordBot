'use server';

import { prisma } from '@refx/database';
import { ticketsConfigSchema } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { runLiveCommand } from './redis';

export interface TicketsActionResult {
  ok: boolean;
  error?: string;
  /** It worked, with something worth knowing (e.g. the existing panel was updated). */
  notice?: string;
}

/**
 * Deploy the "open a ticket" panel to the configured channel and wait for the
 * bot to say how it went. A panel already in the channel is updated in place.
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

  const result = await runLiveCommand(guildId, 'DEPLOY_TICKET_PANEL', {
    channelId: config.panelChannelId,
  });
  if (!result) {
    return {
      ok: false,
      error: 'The bot didn’t confirm within 10 seconds. It may be offline or busy; try again.',
    };
  }
  if (!result.ok) return { ok: false, error: result.error ?? 'The bot could not post the panel.' };
  return { ok: true, notice: result.warnings?.join(' ') };
}
