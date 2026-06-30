/**
 * Durable job queue contracts (§5.4). EVERY time-delayed effect in Helios —
 * tempbans, reminders, scheduled messages, giveaway endings, social polling,
 * stat-counter refresh, ticket auto-close, birthdays, log cleanup — flows
 * through these BullMQ queues so it survives a process restart. Using
 * setTimeout/setInterval for any of this is a defect.
 *
 * Phase 0 defines the queue names and typed job payloads. The Queue/Worker
 * wiring (which needs a live Redis connection and the discord.js client) lands
 * in Phase 1.
 */

/**
 * BullMQ namespaces Redis keys with the `prefix` option and forbids `:` in
 * queue names, so queue names are plain and `QUEUE_PREFIX` does the namespacing
 * (keys become `helios:<queue>:...`). Always pass `{ prefix: QUEUE_PREFIX }`
 * when constructing Queues/Workers so both ends agree.
 */
export const QUEUE_PREFIX = 'helios';

export const QUEUE_NAMES = {
  tempActionExpire: 'tempActionExpire',
  reminder: 'reminder',
  scheduledMessage: 'scheduledMessage',
  giveawayEnd: 'giveawayEnd',
  pollEnd: 'pollEnd',
  socialPoll: 'socialPoll',
  statsCounterRefresh: 'statsCounterRefresh',
  ticketAutoClose: 'ticketAutoClose',
  birthdayAnnounce: 'birthdayAnnounce',
  cleanupLogs: 'cleanupLogs',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type TempActionType = 'UNBAN' | 'UNMUTE' | 'TEMPROLE_REMOVE';

export interface TempActionExpireJob {
  type: TempActionType;
  guildId: string;
  userId: string;
  roleId?: string;
  caseId?: string;
}

export interface ReminderJob {
  reminderId: string;
}

export interface ScheduledMessageJob {
  scheduledMessageId: string;
}

export interface GiveawayEndJob {
  giveawayId: string;
}

export interface PollEndJob {
  pollId: string;
}

export interface SocialPollJob {
  subscriptionId: string;
}

export interface StatsCounterRefreshJob {
  guildId: string;
}

export interface TicketAutoCloseJob {
  ticketId: string;
}

export interface BirthdayAnnounceJob {
  guildId: string;
}

export interface CleanupLogsJob {
  guildId: string;
}

/** Maps each queue name to the shape of its job payload. */
export interface JobDataByQueue {
  [QUEUE_NAMES.tempActionExpire]: TempActionExpireJob;
  [QUEUE_NAMES.reminder]: ReminderJob;
  [QUEUE_NAMES.scheduledMessage]: ScheduledMessageJob;
  [QUEUE_NAMES.giveawayEnd]: GiveawayEndJob;
  [QUEUE_NAMES.pollEnd]: PollEndJob;
  [QUEUE_NAMES.socialPoll]: SocialPollJob;
  [QUEUE_NAMES.statsCounterRefresh]: StatsCounterRefreshJob;
  [QUEUE_NAMES.ticketAutoClose]: TicketAutoCloseJob;
  [QUEUE_NAMES.birthdayAnnounce]: BirthdayAnnounceJob;
  [QUEUE_NAMES.cleanupLogs]: CleanupLogsJob;
}
