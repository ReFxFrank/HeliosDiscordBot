import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '../auth';
import type { ManageableGuild } from './discord';
import { enforceMutationRateLimit } from './rate-limit';

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

/** The set of bot-owner Discord user ids, parsed from OWNER_IDS (§ admin). */
function ownerIds(): Set<string> {
  return new Set(
    (process.env.OWNER_IDS ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

/** True when the signed-in user is a bot owner. Never a client-supplied claim. */
export function isOwner(session: Session): boolean {
  const id = session.user?.id;
  return Boolean(id) && ownerIds().has(id as string);
}

/**
 * Require an authenticated bot owner (for owner-only server actions). Throws
 * `Forbidden` for a signed-in non-owner, `Unauthorized` for no session.
 */
export async function requireOwner(): Promise<Session & { user: { id: string } }> {
  const session = await requireSession();
  if (!isOwner(session)) throw new Error('Forbidden: owner only.');
  await enforceMutationRateLimit(session.user.id);
  return session;
}

/**
 * Page-level owner guard: redirects to home for anyone who is not signed in or
 * is not a bot owner (so the admin surface is invisible to non-owners).
 */
export async function guardOwnerPage(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id || !isOwner(session)) redirect('/');
  return session;
}

/**
 * Assert the session can manage the guild. Re-checked on every mutation — and
 * because every guild-scoped server action calls this, it doubles as the
 * per-user mutation rate-limit choke point.
 */
export async function assertCanManage(session: Session, guildId: string): Promise<void> {
  if (!getManageableGuilds(session).some((guild) => guild.id === guildId)) {
    throw new Error('Forbidden: you do not have Manage Server on this guild.');
  }
  await enforceMutationRateLimit(session.user?.id ?? 'anonymous');
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
  if (!guilds.some((guild) => guild.id === guildId)) {
    // Distinguish "you don't manage this server" from "we couldn't verify your
    // servers right now" (token refresh hiccup / empty list): the latter gets a
    // banner on /servers instead of a silent bounce that looks like a dead click.
    const unverifiable = session.error !== undefined || guilds.length === 0;
    redirect(unverifiable ? '/servers?stale=1' : '/servers');
  }
  return { session, guilds };
}
