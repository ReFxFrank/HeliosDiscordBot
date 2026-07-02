'use server';

import { revalidatePath } from 'next/cache';
import { assertCanManage, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';

const DISCORD_API = 'https://discord.com/api/v10';
/** Hard cap per call so a runaway selection can't try to nuke thousands. */
const MAX_PER_CALL = 50;

export interface DeleteChannelsResult {
  ok: boolean;
  deleted: number;
  failed: number;
  error?: string;
}

async function deleteOne(channelId: string, token: string, reason: string): Promise<boolean> {
  try {
    const response = await fetch(`${DISCORD_API}/channels/${channelId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bot ${token}`,
        'X-Audit-Log-Reason': reason.slice(0, 400),
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Bulk-delete channels via the bot token. Re-verifies Manage-Server access,
 * caps the batch, deletes sequentially (kind to Discord's rate limits), audits
 * the action, and reports how many succeeded. Irreversible on Discord's side —
 * the client confirms first.
 */
export async function deleteChannels(
  guildId: string,
  channelIds: string[],
): Promise<DeleteChannelsResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const token = process.env.DISCORD_TOKEN;
  if (!token) return { ok: false, deleted: 0, failed: 0, error: 'Bot token not configured.' };

  const ids = [...new Set(channelIds.filter(Boolean))].slice(0, MAX_PER_CALL);
  if (ids.length === 0) return { ok: false, deleted: 0, failed: 0, error: 'No channels selected.' };

  const reason = `Bulk delete by ${session.user.name ?? session.user.id} via dashboard`;
  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    if (await deleteOne(id, token, reason)) deleted += 1;
    else failed += 1;
  }

  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'CHANNELS_DELETED',
    after: { requested: ids.length, deleted, failed, channelIds: ids },
  });

  revalidatePath(`/servers/${guildId}/channels`);
  return { ok: deleted > 0, deleted, failed };
}
