import type { Module } from './enums';

/**
 * Redis pub/sub channel contracts (§4.1, §4.3). Defined once here and imported
 * by both the bot and the dashboard so the channel names and payload shapes can
 * never drift between the two processes.
 */
export const REDIS_CHANNELS = {
  /** Dashboard -> bot: a guild's module config changed; invalidate the cache. */
  configUpdate: 'helios:config:update',
  /** Dashboard -> bot: do something live right now (test welcome, resync, ...). */
  command: 'helios:command',
} as const;

export interface ConfigUpdateMessage {
  guildId: string;
  module: Module;
}

export type LiveCommandType =
  | 'TEST_WELCOME'
  | 'DEPLOY_EMBED'
  | 'REFRESH_LEADERBOARD'
  | 'RESYNC_COMMANDS'
  | 'REFRESH_STATS'
  | 'DEPLOY_PANEL'
  | 'DELETE_PANEL'
  | 'END_GIVEAWAY'
  | 'REROLL_GIVEAWAY'
  | 'SCHEDULE_MESSAGE'
  | 'CANCEL_SCHEDULED_MESSAGE'
  | 'DEPLOY_TICKET_PANEL'
  | 'REFX_ALERT'
  | 'RESTART_CUSTOM_BOT';

export interface LiveCommandMessage<TPayload = unknown> {
  type: LiveCommandType;
  guildId: string;
  payload?: TPayload;
}

export interface DeployPanelPayload {
  panelId: string;
}

export interface DeletePanelPayload {
  channelId: string;
  messageId: string;
}

export interface GiveawayActionPayload {
  giveawayId: string;
}

export interface ScheduledMessagePayload {
  scheduledMessageId: string;
}

export interface DeployTicketPanelPayload {
  channelId: string;
}

/**
 * A ReFx status/incident alert to post. The web webhook receiver has already
 * matched the event to this guild's subscription and resolved the target
 * channel; the bot re-checks live config and posts. `data` is the validated
 * webhook event data (kept loose so it can carry passthrough fields).
 */
export interface RefxAlertPayload {
  event: 'incident.created' | 'incident.updated' | 'incident.resolved' | 'component.status_changed';
  timestamp: string;
  channelId: string;
  data: unknown;
}

/** Cache key used by the bot's config cache (§4.2). */
export function configCacheKey(guildId: string, module: Module): string {
  return `${guildId}:${module}`;
}

/**
 * Compute the shard that owns a guild, per Discord's sharding formula. The bot
 * defaults to broadcast-and-filter for live commands, but this is available for
 * targeted routing once the live shard count is known.
 */
export function shardIdForGuild(guildId: string, shardCount: number): number {
  return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}
