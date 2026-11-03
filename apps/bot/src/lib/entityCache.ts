import { guildEntitiesKey, type GuildEntityKind } from '@refx/shared';
import { redis } from '../services/redis';

/**
 * Bust the dashboard's cached role/channel picker options for a guild. Called
 * from the gateway role/channel events, so a role created in Discord is
 * selectable in the dashboard on the next page load (instead of after the
 * cache TTL). Fire-and-forget: a failed DEL just means the TTL fallback rules.
 */
export function invalidateEntityCache(kind: GuildEntityKind, guildId: string): void {
  void redis.del(guildEntitiesKey(kind, guildId)).catch(() => undefined);
}
