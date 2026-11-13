import { prisma, type Prisma } from '@refx/database';
import { REDIS_CHANNELS, twitchChatConfigSchema, type TwitchChatConfig } from '@refx/shared';
import { redis } from '../services/redis';

/**
 * Database side of the Twitch chat bot: quotes, counters, the moderation log,
 * and changing the saved settings from chat (!addcmd and friends).
 */

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * Load, change and save the guild's Twitch settings. Returns an error message
 * when the change doesn't validate. The bot's config cache (and the dashboard)
 * pick it up through the usual invalidation message.
 */
export async function updateTwitchConfig(
  guildId: string,
  mutate: (config: TwitchChatConfig) => TwitchChatConfig | string,
): Promise<string | null> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TWITCH_CHAT' } },
    select: { config: true },
  });
  const current = twitchChatConfigSchema.parse(row?.config ?? {});
  const next = mutate(current);
  if (typeof next === 'string') return next;
  const parsed = twitchChatConfigSchema.safeParse(next);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'That change isn’t valid.';
  await prisma.guildModuleConfig.upsert({
    where: { guildId_module: { guildId, module: 'TWITCH_CHAT' } },
    create: { guildId, module: 'TWITCH_CHAT', config: parsed.data as Prisma.InputJsonValue },
    update: { config: parsed.data as Prisma.InputJsonValue, updatedBy: 'twitch-chat' },
  });
  await redis
    .publish(REDIS_CHANNELS.configUpdate, JSON.stringify({ guildId, module: 'TWITCH_CHAT' }))
    .catch(() => undefined);
  return null;
}

// ── Counters ────────────────────────────────────────────────────────────────

export function counterName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '')
    .slice(0, 60);
}

export async function getCounter(guildId: string, name: string): Promise<number> {
  const row = await prisma.twitchCounter.findUnique({
    where: { guildId_name: { guildId, name: counterName(name) } },
  });
  return row?.value ?? 0;
}

export async function addCounter(guildId: string, name: string, delta: number): Promise<number> {
  const key = counterName(name);
  const row = await prisma.twitchCounter.upsert({
    where: { guildId_name: { guildId, name: key } },
    create: { guildId, name: key, value: delta },
    update: { value: { increment: delta } },
  });
  return row.value;
}

export async function setCounter(guildId: string, name: string, value: number): Promise<number> {
  const key = counterName(name);
  const row = await prisma.twitchCounter.upsert({
    where: { guildId_name: { guildId, name: key } },
    create: { guildId, name: key, value },
    update: { value },
  });
  return row.value;
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export interface QuoteRow {
  number: number;
  text: string;
  game: string | null;
  addedBy: string;
  createdAt: Date;
}

export function formatQuote(quote: QuoteRow): string {
  const date = quote.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `Quote #${quote.number}: ${quote.text}${quote.game ? ` [${quote.game}]` : ''} [${date}]`;
}

export async function addQuote(
  guildId: string,
  text: string,
  game: string | null,
  addedBy: string,
): Promise<QuoteRow> {
  return prisma.$transaction(async (tx) => {
    const guild = await tx.guild.update({
      where: { id: guildId },
      data: { twitchQuoteCounter: { increment: 1 } },
      select: { twitchQuoteCounter: true },
    });
    return tx.twitchQuote.create({
      data: { guildId, number: guild.twitchQuoteCounter, text, game, addedBy },
    });
  });
}

/** By number, by search text, or random when `query` is empty. */
export async function findQuote(guildId: string, query: string): Promise<QuoteRow | null> {
  if (/^#?\d+$/.test(query)) {
    return prisma.twitchQuote.findUnique({
      where: { guildId_number: { guildId, number: Number(query.replace('#', '')) } },
    });
  }
  const where: Prisma.TwitchQuoteWhereInput = query
    ? { guildId, text: { contains: query, mode: 'insensitive' } }
    : { guildId };
  const count = await prisma.twitchQuote.count({ where });
  if (count === 0) return null;
  return prisma.twitchQuote.findFirst({
    where,
    skip: Math.floor(Math.random() * count),
    orderBy: { number: 'asc' },
  });
}

export async function editQuote(guildId: string, number: number, text: string): Promise<boolean> {
  const res = await prisma.twitchQuote.updateMany({ where: { guildId, number }, data: { text } });
  return res.count > 0;
}

export async function deleteQuote(guildId: string, number: number): Promise<boolean> {
  const res = await prisma.twitchQuote.deleteMany({ where: { guildId, number } });
  return res.count > 0;
}

// ── Moderation log ──────────────────────────────────────────────────────────

export interface ModLogEntry {
  kind: string;
  action: string;
  detail: string;
  userLogin?: string | null;
  userId?: string | null;
  actor?: string | null;
  data?: Prisma.InputJsonValue;
}

export async function writeModLog(guildId: string, entry: ModLogEntry): Promise<string | null> {
  try {
    const row = await prisma.twitchModLog.create({
      data: {
        guildId,
        kind: entry.kind,
        action: entry.action,
        detail: entry.detail.slice(0, 500),
        userLogin: entry.userLogin ?? null,
        userId: entry.userId ?? null,
        actor: entry.actor ?? null,
        data: entry.data,
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    return null;
  }
}

/** Keep the log to the last 30 days. */
export async function pruneModLog(): Promise<void> {
  await prisma.twitchModLog
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } })
    .catch(() => undefined);
}
