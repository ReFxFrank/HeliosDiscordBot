import { AuditLogEvent, type Guild } from 'discord.js';

/**
 * Work out who deleted a message from the guild audit log (needs View Audit
 * Log). Discord quirks this handles:
 *
 *   - Deleting your OWN message never creates an entry, and neither does a
 *     bot deleting anything, so "no entry" means the author or a bot did it.
 *   - Repeated deletes by the same moderator, of the same author, in the same
 *     channel are merged into one entry whose `extra.count` goes up while its
 *     timestamp stays at the first delete. We count how many of each entry's
 *     so each bumped count is handed out once (two quick deletes that land in
 *     one merged entry are both attributed).
 *   - Entries land a moment after the gateway event, hence the short wait.
 */

const ENTRY_DELAY_MS = 1_500;
/** A brand-new entry younger than this is taken to be our delete. */
const FRESH_MS = 15_000;
/** Audit entry id -> how many of its (merged) deletes we have already attributed. */
const claimed = new Map<string, number>();

/** The only user fields the logs need (audit entries can carry partial users). */
export interface AuditUser {
  id: string;
  bot: boolean | null;
}

const toAuditUser = (
  user: { id: string; bot: boolean | null } | null | undefined,
): AuditUser | null => (user ? { id: user.id, bot: user.bot } : null);

export interface DeleteAttribution {
  /** Who deleted it, or null when the audit log has nothing (the author or a bot). */
  executor: AuditUser | null;
  /** The message author, as the audit log records it (fills in uncached messages). */
  target: AuditUser | null;
}

function remember(id: string, used: number): void {
  claimed.set(id, used);
  // Bounded: only recent entries ever matter.
  if (claimed.size > 500) {
    const oldest = claimed.keys().next().value;
    if (oldest) claimed.delete(oldest);
  }
}

export async function findMessageDeleter(
  guild: Guild,
  channelId: string,
  authorId: string | null,
): Promise<DeleteAttribution> {
  await new Promise((resolve) => setTimeout(resolve, ENTRY_DELAY_MS));
  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 10 })
    .catch(() => null);
  if (!logs) return { executor: null, target: null };

  const now = Date.now();
  for (const entry of logs.entries.values()) {
    if (entry.extra.channel.id !== channelId) continue;
    if (authorId && entry.targetId !== authorId) continue;
    const count = entry.extra.count;
    // An entry we have never seen and that is not new predates this process
    // (e.g. a restart): treat all of its deletes as already accounted for.
    const used = claimed.get(entry.id) ?? (now - entry.createdTimestamp < FRESH_MS ? 0 : count);
    remember(entry.id, Math.min(count, used + 1));
    if (used < count) {
      return {
        executor: toAuditUser(entry.executor),
        target: toAuditUser(entry.target),
      };
    }
  }
  return { executor: null, target: null };
}

/** Who ran a bulk delete (e.g. /purge or a Discord client purge) in a channel. */
export async function findBulkDeleter(guild: Guild, channelId: string): Promise<AuditUser | null> {
  await new Promise((resolve) => setTimeout(resolve, ENTRY_DELAY_MS));
  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 5 })
    .catch(() => null);
  const entry = logs?.entries.find(
    (e) => e.targetId === channelId && Date.now() - e.createdTimestamp < FRESH_MS,
  );
  return toAuditUser(entry?.executor);
}
