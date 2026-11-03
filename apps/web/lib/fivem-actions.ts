'use server';

import { prisma } from '@refx/database';
import { fivemConfigSchema, type FivemRefreshPayload } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { publishLiveCommand } from './redis';

export interface FivemActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Ask the bot to re-render the FiveM status panel now. `repost: false` edits
 * the existing panel message in place; `repost: true` posts a fresh panel
 * (e.g. after the old one was deleted or the channel changed). The bot owns
 * the actual posting; this re-checks access and that a panel channel is set.
 */
export async function refreshFivemPanel(
  guildId: string,
  repost: boolean,
): Promise<FivemActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'FIVEM' } },
    select: { config: true, enabled: true },
  });
  const config = fivemConfigSchema.parse(row?.config ?? {});
  if (!row?.enabled) {
    return { ok: false, error: 'Turn the FiveM City module on (Overview) first.' };
  }
  if (!config.panelChannelId) {
    return { ok: false, error: 'Pick a status panel channel and save first.' };
  }
  if (!config.host.trim()) {
    return { ok: false, error: 'Set the server host and save first.' };
  }

  const payload: FivemRefreshPayload = { repost };
  await publishLiveCommand(guildId, 'FIVEM_REFRESH', payload);
  return { ok: true };
}
