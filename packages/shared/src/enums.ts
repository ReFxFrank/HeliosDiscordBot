/**
 * Shared enums. The `MODULES` list and `Module` type MUST stay in sync with
 * the `Module` enum in `packages/database/prisma/schema.prisma`.
 */

export const MODULES = [
  'MODERATION',
  'AUTOMOD',
  'VERIFICATION',
  'LOGGING',
  'WELCOME',
  'AUTOROLE',
  'LEVELING',
  'ACHIEVEMENTS',
  'ROLES',
  'CUSTOM_COMMANDS',
  'STARBOARD',
  'GIVEAWAYS',
  'POLLS',
  'SUGGESTIONS',
  'REMINDERS',
  'SCHEDULED_MESSAGES',
  'TICKETS',
  'STATS_COUNTERS',
  'INVITE_TRACKING',
  'BIRTHDAYS',
  'AFK',
  'SOCIAL',
  'TEMP_VOICE',
  'UTILITY',
  'FUN',
  'APPLICATIONS',
  'FIVEM',
  'TWITCH_CHAT',
] as const;

export type Module = (typeof MODULES)[number];

export const MODERATION_ACTION_TYPES = [
  'WARN',
  'MUTE',
  'KICK',
  'BAN',
  'SOFTBAN',
  'TEMPBAN',
  'UNBAN',
  'NOTE',
] as const;
export type ModerationActionType = (typeof MODERATION_ACTION_TYPES)[number];

export function isModule(value: string): value is Module {
  return (MODULES as readonly string[]).includes(value);
}
