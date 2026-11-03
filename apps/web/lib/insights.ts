import { prisma } from '@refx/database';

/** One zero-filled UTC day for the charts. */
export interface InsightsDay {
  /** yyyy-mm-dd (UTC). */
  date: string;
  messages: number;
  activeMembers: number;
  joins: number;
  leaves: number;
  memberCount: number;
}

export interface GuildInsights {
  days: InsightsDay[];
  totals: { messages: number; joins: number; leaves: number; peakActive: number };
  /** Same-length window immediately before, for deltas. */
  prevTotals: { messages: number };
  /** Aggregated across the window, descending. */
  topChannels: { channelId: string; count: number }[];
  /** True when not a single row exists yet (collection hasn't started). */
  empty: boolean;
}

export type InsightsRange = 7 | 30 | 90;

export function parseRange(raw: string | undefined): InsightsRange {
  return raw === '7' ? 7 : raw === '90' ? 90 : 30;
}

function utcDayString(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export async function fetchGuildInsights(
  guildId: string,
  range: InsightsRange,
): Promise<GuildInsights> {
  // Fetch double the window so the previous period is available for deltas.
  const since = new Date(`${utcDayString(-(range * 2 - 1))}T00:00:00.000Z`);
  const rows = await prisma.guildInsightsDay.findMany({
    where: { guildId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });

  const byDate = new Map(rows.map((row) => [row.date.toISOString().slice(0, 10), row]));

  const days: InsightsDay[] = [];
  for (let offset = range - 1; offset >= 0; offset--) {
    const date = utcDayString(-offset);
    const row = byDate.get(date);
    days.push({
      date,
      messages: row?.messages ?? 0,
      activeMembers: row?.activeMembers ?? 0,
      joins: row?.joins ?? 0,
      leaves: row?.leaves ?? 0,
      memberCount: row?.memberCount ?? 0,
    });
  }

  // Carry the last known member count forward through snapshot-less days so
  // the growth line doesn't crater to zero on quiet days.
  let lastKnown = 0;
  for (const day of days) {
    if (day.memberCount > 0) lastKnown = day.memberCount;
    else day.memberCount = lastKnown;
  }

  const totals = {
    messages: days.reduce((sum, d) => sum + d.messages, 0),
    joins: days.reduce((sum, d) => sum + d.joins, 0),
    leaves: days.reduce((sum, d) => sum + d.leaves, 0),
    peakActive: days.reduce((max, d) => Math.max(max, d.activeMembers), 0),
  };

  const currentDates = new Set(days.map((d) => d.date));
  const prevTotals = {
    messages: rows
      .filter((row) => !currentDates.has(row.date.toISOString().slice(0, 10)))
      .reduce((sum, row) => sum + row.messages, 0),
  };

  const channelCounts = new Map<string, number>();
  for (const row of rows) {
    if (!currentDates.has(row.date.toISOString().slice(0, 10))) continue;
    const top = row.topChannels as { channelId: string; count: number }[] | null;
    if (!Array.isArray(top)) continue;
    for (const entry of top) {
      if (!entry?.channelId) continue;
      channelCounts.set(entry.channelId, (channelCounts.get(entry.channelId) ?? 0) + entry.count);
    }
  }
  const topChannels = [...channelCounts.entries()]
    .map(([channelId, count]) => ({ channelId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { days, totals, prevTotals, topChannels, empty: rows.length === 0 };
}

/** 1284 → "1.3K", 12 → "12" — chart/tile display formatting. */
export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString();
}
