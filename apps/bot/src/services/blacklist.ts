import { prisma } from '@refx/database';

/**
 * In-memory blacklist cache. The set of barred guilds/users is tiny and changes
 * rarely, so we hold it in memory and refresh on a short TTL (picking up
 * dashboard-side changes without a restart). Owner `/admin blacklist` mutations
 * invalidate it directly for instant effect.
 */
interface BlacklistCache {
  guilds: Set<string>;
  users: Set<string>;
  loadedAt: number;
}

const TTL_MS = 60_000;
let cacheState: BlacklistCache | null = null;

async function load(): Promise<BlacklistCache> {
  const rows = await prisma.blacklist.findMany({ select: { type: true, targetId: true } });
  const guilds = new Set<string>();
  const users = new Set<string>();
  for (const row of rows) {
    if (row.type === 'GUILD') guilds.add(row.targetId);
    else users.add(row.targetId);
  }
  cacheState = { guilds, users, loadedAt: Date.now() };
  return cacheState;
}

async function current(): Promise<BlacklistCache> {
  if (!cacheState || Date.now() - cacheState.loadedAt > TTL_MS) return load();
  return cacheState;
}

/**
 * Whether a guild or user is blacklisted. Fails OPEN (returns false) on any DB
 * error so an outage can never lock every server out of the bot.
 */
export async function isBlacklisted(guildId: string | null, userId: string): Promise<boolean> {
  try {
    const bl = await current();
    return bl.users.has(userId) || (guildId !== null && bl.guilds.has(guildId));
  } catch {
    return false;
  }
}

/** Force a reload on the next check (call after an owner blacklist change). */
export function invalidateBlacklist(): void {
  cacheState = null;
}
