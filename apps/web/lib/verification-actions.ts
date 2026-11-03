'use server';

import { prisma } from '@refx/database';
import { verificationConfigSchema } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { publishLiveCommand } from './redis';

export interface VerificationActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Deploy the verification panel to the configured channel. The bot owns the
 * actual posting; this just publishes the live command after re-checking access
 * and that the module is actually usable.
 */
export async function deployVerificationPanel(guildId: string): Promise<VerificationActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'VERIFICATION' } },
    select: { config: true },
  });
  const config = verificationConfigSchema.parse(row?.config ?? {});
  if (!config.panelChannelId) {
    return { ok: false, error: 'Set a panel channel and save before deploying.' };
  }
  if (!config.verifiedRoleId) {
    return { ok: false, error: 'Pick a verified role and save before deploying.' };
  }

  await publishLiveCommand(guildId, 'DEPLOY_VERIFY_PANEL', { channelId: config.panelChannelId });
  return { ok: true };
}
