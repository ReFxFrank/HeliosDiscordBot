'use server';

import { assertCanManage, requireSession } from './auth-guards';
import { publishLiveCommand } from './redis';

export interface LockdownActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Panic button: ask the bot to lock every channel now. The bot owns the actual
 * permission edits (only it has a gateway); this just re-checks access and
 * publishes the live command with the acting moderator's id for the audit log.
 */
export async function lockdownNow(guildId: string, reason?: string): Promise<LockdownActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  await publishLiveCommand(guildId, 'LOCKDOWN_START', {
    moderatorId: session.user.id,
    reason: reason?.trim().slice(0, 300) || undefined,
  });
  return { ok: true };
}

/** Lift a server lockdown — the bot restores every locked channel's prior state. */
export async function liftLockdown(guildId: string): Promise<LockdownActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  await publishLiveCommand(guildId, 'LOCKDOWN_END');
  return { ok: true };
}
