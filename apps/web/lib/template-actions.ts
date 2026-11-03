'use server';

import { getServerTemplate } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { publishLiveCommand } from './redis';

export interface TemplateActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Ask the bot to build a server template. The bot owns the actual channel/role
 * creation (only it has a gateway + bot token); this re-checks Manage-Server
 * access and publishes the live command with the acting user's id for the
 * audit trail and the in-guild summary.
 */
export async function applyServerTemplateAction(
  guildId: string,
  templateId: string,
): Promise<TemplateActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const template = getServerTemplate(templateId);
  if (!template) return { ok: false, error: 'Unknown template.' };
  await publishLiveCommand(guildId, 'APPLY_SERVER_TEMPLATE', {
    templateId,
    actorId: session.user.id,
  });
  return { ok: true };
}
