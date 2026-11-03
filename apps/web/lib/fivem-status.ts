import { FIVEM_REDIS_KEYS, type FivemSnapshot } from '@refx/shared';
import { getRedis } from './redis';

/** How long the page waits on Redis before rendering "status unavailable". */
const READ_TIMEOUT_MS = 1_500;

export type FivemStatusRead =
  | { kind: 'ok'; snapshot: FivemSnapshot }
  /** Nothing stored yet: module off, no host set, or the bot hasn't polled. */
  | { kind: 'empty' }
  /** Redis unreachable or the stored value is malformed. */
  | { kind: 'error' };

function isSnapshot(value: unknown): value is FivemSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.online === 'boolean' &&
    Array.isArray(v.players) &&
    typeof v.maxPlayers === 'number' &&
    typeof v.checkedAt === 'string' &&
    (v.onlineSince === null || typeof v.onlineSince === 'string')
  );
}

/**
 * The bot's latest FiveM poll for a guild, read from Redis (the bot writes it
 * under `FIVEM_REDIS_KEYS.status`). Server-only and NOT a server action, so it
 * can't be invoked for an arbitrary guild from the client; callers guard first.
 */
export async function readFivemSnapshot(guildId: string): Promise<FivemStatusRead> {
  try {
    const raw = await Promise.race([
      getRedis().get(FIVEM_REDIS_KEYS.status(guildId)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('redis timeout')), READ_TIMEOUT_MS),
      ),
    ]);
    if (!raw) return { kind: 'empty' };
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? { kind: 'ok', snapshot: parsed } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
