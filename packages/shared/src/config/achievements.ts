import { z } from 'zod';

/**
 * Achievements module (free). Server admins define achievements that members
 * unlock by reaching thresholds on a tracked stat (level, messages, coins, or
 * voice minutes). Each achievement is either **single** (one threshold) or
 * **tiered** (Bronze/Silver/Gold/Diamond thresholds unlocked in order), matching
 * MEE6's model. Rewards (role / coins / XP) can be granted per tier.
 */

export const ACHIEVEMENT_TYPES = [
  'LEVEL',
  'MESSAGES',
  'VOICE_MINUTES',
  'REACTIONS',
  'THREADS_CREATED',
  'THREADS_JOINED',
  'INVITES',
  'GIVEAWAYS_JOINED',
  'SERVER_BOOSTED',
  'BIRTHDAY_SET',
] as const;
export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];

export const ACHIEVEMENT_TYPE_LABELS: Record<AchievementType, string> = {
  LEVEL: 'Reach level',
  MESSAGES: 'Send messages',
  VOICE_MINUTES: 'Minutes in voice',
  REACTIONS: 'Add reactions',
  THREADS_CREATED: 'Create threads',
  THREADS_JOINED: 'Join threads',
  INVITES: 'Invite members',
  GIVEAWAYS_JOINED: 'Enter giveaways',
  SERVER_BOOSTED: 'Boost the server',
  BIRTHDAY_SET: 'Set a birthday',
};

/** Short unit shown next to a threshold, e.g. "6,000 messages". */
export const ACHIEVEMENT_TYPE_UNIT: Record<AchievementType, string> = {
  LEVEL: '',
  MESSAGES: 'messages',
  VOICE_MINUTES: 'min',
  REACTIONS: 'reactions',
  THREADS_CREATED: 'threads',
  THREADS_JOINED: 'threads',
  INVITES: 'invites',
  GIVEAWAYS_JOINED: 'giveaways',
  SERVER_BOOSTED: '',
  BIRTHDAY_SET: '',
};

/** Tiers in ascending order; a single achievement uses only index 0. */
export const ACHIEVEMENT_TIERS = ['bronze', 'silver', 'gold', 'diamond'] as const;
export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number];

export const ACHIEVEMENT_TIER_LABELS: Record<AchievementTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond',
};

export const ACHIEVEMENT_TIER_EMOJI: Record<AchievementTier, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  diamond: '💎',
};

/** The tier label for the Nth tier of an achievement (by index, clamped). */
export function tierAt(index: number): AchievementTier {
  return ACHIEVEMENT_TIERS[Math.min(Math.max(index, 0), ACHIEVEMENT_TIERS.length - 1)] ?? 'bronze';
}

export function isTieredAchievement(a: { tiers: unknown[] }): boolean {
  return a.tiers.length > 1;
}

/** One tier of an achievement: a threshold plus optional rewards. */
export const achievementTierSchema = z.object({
  threshold: z.number().int().min(1).max(1_000_000_000),
  rewardRoleId: z.string().nullable().default(null),
  rewardXp: z.number().int().min(0).max(1_000_000).default(0),
});
export type AchievementTierDef = z.infer<typeof achievementTierSchema>;

export const achievementSchema = z.object({
  /** Stable id (records who unlocked what — must not be reused). */
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(100),
  description: z.string().max(200).optional(),
  type: z.enum(ACHIEVEMENT_TYPES),
  enabled: z.boolean().default(true),
  /** 1 tier = single achievement; 2–4 = tiered (bronze→diamond by index). */
  tiers: z.array(achievementTierSchema).min(1).max(4),
});
export type Achievement = z.infer<typeof achievementSchema>;

/** Migrate a legacy single-threshold achievement (pre-tiers) to the tiers model. */
function migrateAchievement(raw: unknown): unknown {
  if (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    !('tiers' in raw) &&
    'threshold' in raw
  ) {
    const r = raw as Record<string, unknown>;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type,
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      tiers: [
        {
          threshold: r.threshold,
          rewardRoleId: r.rewardRoleId ?? null,
          rewardXp: r.rewardXp ?? 0,
        },
      ],
    };
  }
  return raw;
}

const bareTier = (threshold: number): AchievementTierDef => ({
  threshold,
  rewardRoleId: null,
  rewardXp: 0,
});

/**
 * Curated MEE6-style starter achievements. Ids are assigned when added to a
 * guild's config. Only stats the bot tracks (level, messages, voice) are
 * used, so every preset actually unlocks.
 */
export const ACHIEVEMENT_PRESETS: Omit<Achievement, 'id'>[] = [
  {
    name: 'King of Spam',
    description: 'Send messages in the server',
    type: 'MESSAGES',
    enabled: true,
    tiers: [bareTier(25), bareTier(250), bareTier(1000), bareTier(6000)],
  },
  {
    name: 'Stay Awhile and Listen',
    description: 'Spend minutes in voice channels',
    type: 'VOICE_MINUTES',
    enabled: true,
    tiers: [bareTier(30), bareTier(60), bareTier(300), bareTier(600)],
  },
  {
    name: 'Voice Veteran',
    description: 'Rack up serious hours in voice',
    type: 'VOICE_MINUTES',
    enabled: true,
    // 1 day / 3 days / 1 week / 1 month of accumulated voice time.
    tiers: [bareTier(1440), bareTier(4320), bareTier(10080), bareTier(43200)],
  },
  {
    name: 'Level Legend',
    description: 'Climb the leveling ranks',
    type: 'LEVEL',
    enabled: true,
    tiers: [bareTier(5), bareTier(25), bareTier(50), bareTier(100)],
  },
  {
    name: 'Reaction Master',
    description: 'Add reactions to messages',
    type: 'REACTIONS',
    enabled: true,
    tiers: [bareTier(50), bareTier(250), bareTier(1000), bareTier(2000)],
  },
  {
    name: 'Thread Creator',
    description: 'Create threads',
    type: 'THREADS_CREATED',
    enabled: true,
    tiers: [bareTier(5), bareTier(25), bareTier(100), bareTier(250)],
  },
  {
    name: 'Thread Participant',
    description: 'Participate in threads',
    type: 'THREADS_JOINED',
    enabled: true,
    tiers: [bareTier(10), bareTier(50), bareTier(250), bareTier(500)],
  },
  {
    name: 'Welcoming Committee',
    description: 'Invite members to the server',
    type: 'INVITES',
    enabled: true,
    tiers: [bareTier(1), bareTier(5), bareTier(25), bareTier(100)],
  },
  {
    name: 'First Words',
    description: 'Send your first message',
    type: 'MESSAGES',
    enabled: true,
    tiers: [bareTier(1)],
  },
  {
    name: 'To Infinity!',
    description: 'Boost the server at least once',
    type: 'SERVER_BOOSTED',
    enabled: true,
    tiers: [bareTier(1)],
  },
  {
    name: 'Happy Birthday!',
    description: 'Set your birthday date',
    type: 'BIRTHDAY_SET',
    enabled: true,
    tiers: [bareTier(1)],
  },
  {
    name: 'Santa is in Town',
    description: 'Participate in a giveaway',
    type: 'GIVEAWAYS_JOINED',
    enabled: true,
    tiers: [bareTier(1)],
  },
];

export const achievementsConfigSchema = z.object({
  /** Announce unlocks in a channel. */
  announce: z.boolean().default(true),
  announceChannelId: z.string().nullable().default(null),
  achievements: z
    .preprocess(
      (val) => (Array.isArray(val) ? val.map(migrateAchievement) : val),
      z
        .array(achievementSchema)
        .max(50)
        // Duplicate ids would make "already unlocked" checks ambiguous.
        .refine((list) => new Set(list.map((a) => a.id)).size === list.length, {
          message: 'Each achievement id must be unique.',
        }),
    )
    .default([]),
});
export type AchievementsConfig = z.infer<typeof achievementsConfigSchema>;
