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
  | 'SETUP_TICKETS'
  | 'DEPLOY_VERIFY_PANEL'
  | 'DEPLOY_APPLICATION_PANEL'
  | 'APPLICATION_SIDE_EFFECTS'
  | 'LOCKDOWN_START'
  | 'LOCKDOWN_END'
  | 'SYNC_STAY_VOICE'
  | 'REFRESH_COMMAND_TOGGLES'
  | 'APPLY_SERVER_TEMPLATE'
  | 'FIVEM_REFRESH'
  | 'SOCIAL_SUBSCRIBE'
  | 'SOCIAL_UNSUBSCRIBE';

export interface LiveCommandMessage<TPayload = unknown> {
  type: LiveCommandType;
  guildId: string;
  payload?: TPayload;
}

export interface DeployPanelPayload {
  panelId: string;
  /** When set, the bot reports the outcome under `liveResultKey(requestId)`. */
  requestId?: string;
}

/**
 * Outcome of a live command the dashboard is waiting on. The bot writes it to
 * Redis (short TTL) and the dashboard's server action polls for it, so a failed
 * post can be shown to the admin with its reason instead of failing silently.
 */
export interface LiveCommandResult {
  ok: boolean;
  /** Why it failed, in words an admin can act on. */
  error?: string;
  /** It worked, but something needs attention (e.g. a role the bot can't assign). */
  warnings?: string[];
}

export const liveResultKey = (requestId: string): string => `helios:result:${requestId}`;
/** How long a result stays readable. */
export const LIVE_RESULT_TTL_SECONDS = 60;

export interface DeletePanelPayload {
  channelId: string;
  messageId: string;
}

export interface GiveawayActionPayload {
  giveawayId: string;
}

/** SOCIAL_SUBSCRIBE / SOCIAL_UNSUBSCRIBE: an alert was added or removed on the dashboard. */
export interface SocialSubscriptionPayload {
  subscriptionId: string;
}

export interface ScheduledMessagePayload {
  scheduledMessageId: string;
}

export interface DeployTicketPanelPayload {
  channelId: string;
}

export interface DeployVerifyPanelPayload {
  channelId: string;
}

export interface DeployApplicationPanelPayload {
  channelId: string;
}

export interface ApplicationSideEffectsPayload {
  submissionId: string;
}

export interface LockdownStartPayload {
  /** Moderator who triggered it (dashboard user id), for the audit case. */
  moderatorId: string;
  reason?: string;
}

export interface ApplyServerTemplatePayload {
  /** ServerTemplate.id to apply. */
  templateId: string;
  /** Dashboard user who triggered it (for the audit trail + summary). */
  actorId: string;
}

export interface DeployEmbedPayload {
  /** SavedEmbed.id to post (or edit in place when already posted). */
  embedId: string;
}

/** Cache key used by the bot's config cache (§4.2). */
export function configCacheKey(guildId: string, module: Module): string {
  return `${guildId}:${module}`;
}

/**
 * Dashboard cache of a guild's role/channel picker options (fetched from the
 * Discord REST API by the web app). The bot DELs the matching key on gateway
 * role/channel events, so a role created in Discord appears in dropdowns on
 * the next page load instead of after a TTL. The TTL is only the fallback for
 * missed events (e.g. bot briefly down).
 */
export type GuildEntityKind = 'roles' | 'channels';

export function guildEntitiesKey(kind: GuildEntityKind, guildId: string): string {
  return `web:entities:${kind}:${guildId}`;
}

export const GUILD_ENTITIES_TTL_SECONDS = 300;

/**
 * Bot -> dashboard: each shard refreshes a TTL'd status key every ~30s (bot
 * heartbeat service); /status reads them all. A missing/expired key means the
 * shard is down or can't reach Redis.
 */
export const SHARD_STATUS_PREFIX = 'helios:status:shard:';

export function shardStatusKey(shardId: number): string {
  return `${SHARD_STATUS_PREFIX}${shardId}`;
}

/**
 * Bot uptime ledger: one bitmap per UTC day, one bit per minute (1440). Every
 * shard heartbeat sets the current minute's bit, so BITCOUNT/1440 is that day's
 * uptime fraction — shard-count independent, ~180 bytes/day. /status renders
 * the trailing 90 days from these.
 */
export const STATUS_MINUTES_PREFIX = 'helios:status:minutes:';

/** Key for a UTC calendar day, e.g. statusMinutesKey(new Date()) → …:2026-07-02 */
export function statusMinutesKey(date: Date): string {
  return `${STATUS_MINUTES_PREFIX}${date.toISOString().slice(0, 10)}`;
}

/** Days the per-day uptime bitmaps are retained (90 shown + slack). */
export const STATUS_MINUTES_TTL_DAYS = 95;

export interface ShardStatus {
  shardId: number;
  /** Gateway websocket ping in ms (-1 until the first heartbeat ack). */
  ping: number;
  guilds: number;
  uptimeMs: number;
  updatedAt: string;
}

/**
 * Compute the shard that owns a guild, per Discord's sharding formula. The bot
 * defaults to broadcast-and-filter for live commands, but this is available for
 * targeted routing once the live shard count is known.
 */
export function shardIdForGuild(guildId: string, shardCount: number): number {
  return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}

/** FIVEM_REFRESH: re-render the status panel now; `repost` posts a fresh message. */
export interface FivemRefreshPayload {
  repost?: boolean;
}
