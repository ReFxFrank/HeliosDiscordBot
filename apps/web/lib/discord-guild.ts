/**
 * Server-side fetch of a guild's roles + channels via the BOT token, so config
 * forms can render real dropdowns instead of asking for raw IDs. Bot-token use
 * is server-only (never shipped to the client). Results are cached briefly to
 * stay well within Discord's rate limits.
 */

const DISCORD_API = 'https://discord.com/api/v10';
const CACHE_SECONDS = 60;

export interface RoleOption {
  id: string;
  name: string;
  /** Decimal RGB; 0 means "no color" (Discord renders the default grey). */
  color: number;
}

export interface ChannelOption {
  id: string;
  name: string;
  /** Discord channel type (see CHANNEL_TYPE). */
  type: number;
}

export const CHANNEL_TYPE = {
  text: 0,
  voice: 2,
  category: 4,
  announcement: 5,
  stage: 13,
  forum: 15,
} as const;

/** Text-capable channels (where the bot can post). */
export const TEXTUAL_CHANNEL_TYPES = [
  CHANNEL_TYPE.text,
  CHANNEL_TYPE.announcement,
  CHANNEL_TYPE.forum,
];
export const VOICE_CHANNEL_TYPES = [CHANNEL_TYPE.voice, CHANNEL_TYPE.stage];

interface RawRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}
interface RawChannel {
  id: string;
  name: string;
  type: number;
  position: number;
}

async function botFetch(path: string): Promise<unknown> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return null; // dashboard can run without it — forms fall back to text inputs
  try {
    const response = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate: CACHE_SECONDS },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** Roles offered in pickers: excludes @everyone and managed (bot/integration) roles, highest first. */
export async function getGuildRoles(guildId: string): Promise<RoleOption[]> {
  const data = await botFetch(`/guilds/${guildId}/roles`);
  if (!Array.isArray(data)) return [];
  return (data as RawRole[])
    .filter((role) => role.id !== guildId && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name, color: role.color }));
}

/** All text/voice/category channels, in Discord's display order. */
export async function getGuildChannels(guildId: string): Promise<ChannelOption[]> {
  const data = await botFetch(`/guilds/${guildId}/channels`);
  if (!Array.isArray(data)) return [];
  const allowed = new Set<number>([
    ...TEXTUAL_CHANNEL_TYPES,
    ...VOICE_CHANNEL_TYPES,
    CHANNEL_TYPE.category,
  ]);
  return (data as RawChannel[])
    .filter((channel) => allowed.has(channel.type))
    .sort((a, b) => a.position - b.position)
    .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type }));
}

/** Fetch roles + channels together (parallel) for a config page. */
export async function getGuildEntities(
  guildId: string,
): Promise<{ roles: RoleOption[]; channels: ChannelOption[] }> {
  const [roles, channels] = await Promise.all([getGuildRoles(guildId), getGuildChannels(guildId)]);
  return { roles, channels };
}
