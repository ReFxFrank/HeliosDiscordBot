import { z } from 'zod';

/**
 * Auto-updating channel-name counters (§8). Each counter renames a channel to a
 * template with the live count. Only counts that are cheap + accurate from the
 * gateway cache are supported (no presence intent required).
 */
export const STAT_COUNTER_TYPES = ['members', 'boosts', 'roles', 'channels'] as const;
export type StatCounterType = (typeof STAT_COUNTER_TYPES)[number];

export const STAT_COUNTER_LABELS: Record<StatCounterType, string> = {
  members: 'Members',
  boosts: 'Boosts',
  roles: 'Roles',
  channels: 'Channels',
};

export const statCounterSchema = z.object({
  channelId: z.string().regex(/^\d{17,20}$/, 'Enter a valid channel ID.'),
  type: z.enum(STAT_COUNTER_TYPES),
  /** Name template; `{count}` is substituted. */
  template: z.string().min(1).max(100).default('{count}'),
});
export type StatCounter = z.infer<typeof statCounterSchema>;

export const statsCountersConfigSchema = z.object({
  counters: z.array(statCounterSchema).max(10).default([]),
  /** Refresh cadence; Discord rate-limits channel renames (~2 / 10 min). */
  intervalMinutes: z.number().int().min(5).max(1440).default(10),
});
export type StatsCountersConfig = z.infer<typeof statsCountersConfigSchema>;

export interface StatCounts {
  members: number;
  boosts: number;
  roles: number;
  channels: number;
}

/** Render a counter's channel name from its template and the live counts. */
export function renderCounterName(counter: StatCounter, counts: StatCounts): string {
  return counter.template.replace('{count}', String(counts[counter.type] ?? 0)).slice(0, 100);
}
