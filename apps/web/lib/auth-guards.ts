import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '../auth';
import type { ManageableGuild } from './discord';

/**
 * Manageable guilds for the signed-in user. This list is derived server-side in
 * the Auth.js JWT callback (verified against Discord, refreshed ~every 60s) and
 * stored in the encrypted JWT, so reading it here is a server-side check — never
 * a client-supplied claim (§9/§10).
 */
export function getManageableGuilds(session: Session): ManageableGuild[] {
  return session.guilds ?? [];
}

/** Require an authenticated session (for server actions). */
export async function requireSession(): Promise<Session & { user: { id: string } }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session as Session & { user: { id: string } };
}

/** Assert the session can manage the guild. Re-checked on every mutation. */
export async function assertCanManage(session: Session, guildId: string): Promise<void> {
  if (!getManageableGuilds(session).some((guild) => guild.id === guildId)) {
    throw new Error('Forbidden: you do not have Manage Server on this guild.');
  }
}

/**
 * Page-level guard: ensures a session and Manage-Server access, redirecting
 * instead of throwing for a clean UX. Returns the session + manageable guilds.
 */
export async function guardGuildAccess(
  guildId: string,
): Promise<{ session: Session; guilds: ManageableGuild[] }> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');
  const guilds = getManageableGuilds(session);
  if (!guilds.some((guild) => guild.id === guildId)) redirect('/servers');
  return { session, guilds };
}
