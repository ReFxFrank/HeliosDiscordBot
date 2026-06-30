/** Minimal Discord REST helpers used by the dashboard (server-side only). */

const ADMINISTRATOR = 1n << 3n; // 0x8 — implies all permissions
const MANAGE_GUILD = 1n << 5n; // 0x20

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string; // bitfield as a string
}

/** Fetch the guilds the signed-in user belongs to. */
export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuildSummary[]> {
  const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Discord guild fetch failed (${response.status})`);
  }
  return (await response.json()) as DiscordGuildSummary[];
}

/** True if the user owns the guild, is an Administrator, or has Manage Server. */
export function canManageGuild(guild: DiscordGuildSummary): boolean {
  if (guild.owner) return true;
  const perms = BigInt(guild.permissions);
  return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
}

/** The non-secret guild summary stored on the session (id/name/icon only). */
export interface ManageableGuild {
  id: string;
  name: string;
  icon: string | null;
}

/** Fetch the user's guilds and reduce to the manageable ones (minimal fields). */
export async function fetchManageableGuilds(accessToken: string): Promise<ManageableGuild[]> {
  const guilds = await fetchUserGuilds(accessToken);
  return guilds.filter(canManageGuild).map(({ id, name, icon }) => ({ id, name, icon }));
}

export function guildIconUrl(id: string, icon: string | null, size = 64): string | null {
  if (!icon) return null;
  const ext = icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=${size}`;
}
