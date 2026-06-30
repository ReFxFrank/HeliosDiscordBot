import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '../auth';
import { canManageGuild, fetchUserGuilds, type DiscordGuildSummary } from './discord';
import { getRedis } from './redis';

const GUILD_CACHE_TTL_SECONDS = 60;

/**
 * Manageable guilds for the signed-in user, verified server-side against
 * Discord (never trusting a client-supplied list, §9/§10). Cached in Redis for
 * 60s per user so we don't hammer the Discord API on every read.
 */
export async function getManageableGuilds(session: Session): Promise<DiscordGuildSummary[]> {
  if (!session.accessToken || !session.user?.id) return [];
  const key = `dash:guilds:${session.user.id}`;
  const redis = getRedis();

  const cached = await redis.get(key).catch(() => null);
  if (cached) return JSON.parse(cached) as DiscordGuildSummary[];

  const guilds = (await fetchUserGuilds(session.accessToken)).filter(canManageGuild);
  await redis
    .set(key, JSON.stringify(guilds), 'EX', GUILD_CACHE_TTL_SECONDS)
    .catch(() => undefined);
  return guilds;
}

/** Require an authenticated session (for server actions). */
export async function requireSession(): Promise<Session & { user: { id: string } }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session as Session & { user: { id: string } };
}

/**
 * Assert the session can manage the guild. Re-verified on every mutation
 * (§9/§10) — throws if not, which surfaces as an error to the caller.
 */
export async function assertCanManage(session: Session, guildId: string): Promise<void> {
  const guilds = await getManageableGuilds(session);
  if (!guilds.some((guild) => guild.id === guildId)) {
    throw new Error('Forbidden: you do not have Manage Server on this guild.');
  }
}

/**
 * Page-level guard: ensures a session and Manage-Server access, redirecting
 * instead of throwing for a clean UX. Returns the session + manageable guilds.
 */
export async function guardGuildAccess(
  guildId: string,
): Promise<{ session: Session; guilds: DiscordGuildSummary[] }> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');
  const guilds = await getManageableGuilds(session);
  if (!guilds.some((guild) => guild.id === guildId)) redirect('/servers');
  return { session, guilds };
}
