import { GUILD_ENTITIES_TTL_SECONDS, guildEntitiesKey, type GuildEntityKind } from '@refx/shared';
import { getRedis } from './redis';

/**
 * Server-side fetch of a guild's roles + channels via the BOT token, so config
 * forms can render real dropdowns instead of asking for raw IDs. Bot-token use
 * is server-only (never shipped to the client).
 *
 * Caching: Redis read-through, NOT Next's fetch cache. The bot deletes the key
 * the moment a gateway role/channel event fires, so a role created in Discord
 * shows up in pickers on the very next page load — while unchanged guilds keep
 * the fast cached path (the TTL only covers missed events). Next's fetch cache
 * couldn't do this: it can't be invalidated from another process, which left
 * new roles invisible for up to 5 minutes no matter how hard users refreshed.
 */

const DISCORD_API = 'https://discord.com/api/v10';

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
      cache: 'no-store', // freshness is governed by the Redis layer below
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Redis read-through for a guild's picker options. Only successful fetches are
 * cached (an error must not pin an empty list for the TTL), and a Redis outage
 * degrades to fetching Discord directly rather than breaking the page.
 */
async function cachedEntities<T>(
  kind: GuildEntityKind,
  guildId: string,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const key = guildEntitiesKey(kind, guildId);
  try {
    const hit = await getRedis().get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // Redis unavailable — serve straight from Discord.
  }
  const fresh = await load();
  if (fresh) {
    try {
      await getRedis().set(key, JSON.stringify(fresh), 'EX', GUILD_ENTITIES_TTL_SECONDS);
    } catch {
      // Cache write is best-effort.
    }
  }
  return fresh;
}

/** Roles offered in pickers: excludes @everyone and managed (bot/integration) roles, highest first. */
export async function getGuildRoles(guildId: string): Promise<RoleOption[]> {
  const roles = await cachedEntities<RoleOption[]>('roles', guildId, async () => {
    const data = await botFetch(`/guilds/${guildId}/roles`);
    if (!Array.isArray(data)) return null;
    return (data as RawRole[])
      .filter((role) => role.id !== guildId && !role.managed)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.color }));
  });
  return roles ?? [];
}

/** All text/voice/category channels, in Discord's display order. */
export async function getGuildChannels(guildId: string): Promise<ChannelOption[]> {
  const channels = await cachedEntities<ChannelOption[]>('channels', guildId, async () => {
    const data = await botFetch(`/guilds/${guildId}/channels`);
    if (!Array.isArray(data)) return null;
    const allowed = new Set<number>([
      ...TEXTUAL_CHANNEL_TYPES,
      ...VOICE_CHANNEL_TYPES,
      CHANNEL_TYPE.category,
    ]);
    return (data as RawChannel[])
      .filter((channel) => allowed.has(channel.type))
      .sort((a, b) => a.position - b.position)
      .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type }));
  });
  return channels ?? [];
}

/** Fetch roles + channels together (parallel) for a config page. */
export async function getGuildEntities(
  guildId: string,
): Promise<{ roles: RoleOption[]; channels: ChannelOption[] }> {
  const [roles, channels] = await Promise.all([getGuildRoles(guildId), getGuildChannels(guildId)]);
  return { roles, channels };
}
