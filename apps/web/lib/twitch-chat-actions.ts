'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { TWITCH_BOT_ACCOUNT_ID, prisma } from '@refx/database';
import {
  TWITCH_SECTIONS,
  twitchChatConfigProblems,
  twitchChatConfigSchema,
  type TwitchChatConfig,
  type TwitchSection,
} from '@refx/shared';
import { assertCanManage, getManageableGuilds, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';
import { applyModuleConfig, type ActionResult } from './config-core';
import { getRedis, publishConfigUpdate } from './redis';

export interface TwitchChatStatus {
  checkedAt: string;
  botLogin: string | null;
  channel: string | null;
  connected: boolean;
  isModerator: boolean | null;
  live: boolean;
  botNeedsReconnect: boolean;
  broadcaster: 'connected' | 'missing' | 'needs-reconnect';
  problem: string | null;
}

/** What the bot last reported for this server's Twitch chat (null: nothing yet). */
export async function getTwitchChatStatus(guildId: string): Promise<TwitchChatStatus | null> {
  // A read polled every few seconds: check access without spending the
  // mutation rate limit that assertCanManage enforces.
  const session = await requireSession();
  if (!getManageableGuilds(session).some((guild) => guild.id === guildId)) return null;
  const raw = await getRedis()
    .get(`twitchchat:status:${guildId}`)
    .catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TwitchChatStatus;
  } catch {
    return null;
  }
}

/** Save one settings section (commands, timers…) without touching the others. */
export async function saveTwitchSection<S extends TwitchSection>(
  guildId: string,
  section: S,
  value: TwitchChatConfig[S],
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  if (!(TWITCH_SECTIONS as readonly string[]).includes(section)) {
    return { ok: false, error: 'Unknown section.' };
  }
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TWITCH_CHAT' } },
    select: { config: true },
  });
  const current = twitchChatConfigSchema.parse(row?.config ?? {});
  const next = { ...current, [section]: value };
  const problems = twitchChatConfigProblems(next);
  if (problems.length > 0) return { ok: false, error: problems[0] };
  const result = await applyModuleConfig(guildId, 'TWITCH_CHAT', next, session.user.id);
  if (result.ok) revalidatePath(`/servers/${guildId}/twitch`, 'layout');
  return result;
}

/** Forget a connected Twitch account; the bot reacts within seconds. */
export async function disconnectTwitchAccount(
  guildId: string,
  role: 'bot' | 'broadcaster',
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  let id: string = TWITCH_BOT_ACCOUNT_ID;
  if (role === 'broadcaster') {
    const config = await loadConfig(guildId);
    const owner = config.channel
      ? await prisma.twitchAccount.findFirst({
          where: { id: { startsWith: 'broadcaster:' }, login: config.channel },
        })
      : null;
    if (!owner) return { ok: true };
    id = owner.id;
  }
  const existing = await prisma.twitchAccount.findUnique({ where: { id } });
  if (existing) {
    await prisma.twitchAccount.delete({ where: { id } });
    await writeAuditLog({
      guildId,
      userId: session.user.id,
      action: `twitch.${role}.disconnect`,
      module: 'TWITCH_CHAT',
      before: { login: existing.login },
    }).catch(() => undefined);
  }
  await publishConfigUpdate(guildId, 'TWITCH_CHAT').catch(() => undefined);
  revalidatePath(`/servers/${guildId}/twitch`);
  return { ok: true };
}

async function loadConfig(guildId: string): Promise<TwitchChatConfig> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TWITCH_CHAT' } },
    select: { config: true },
  });
  return twitchChatConfigSchema.parse(row?.config ?? {});
}

/** Ask the running bot to do something in chat and wait for its answer. */
export async function runTwitchBotCommand(
  guildId: string,
  type: 'nuke' | 'rollback' | 'say' | 'shoutout',
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const requestId = randomUUID();
  const redis = getRedis();
  await redis.publish(
    'twitchchat:command',
    JSON.stringify({ guildId, type, payload: { ...payload, actor: session.user.id }, requestId }),
  );
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const raw = await redis.get(`twitchchat:result:${requestId}`).catch(() => null);
    if (!raw) continue;
    try {
      const result = JSON.parse(raw) as { ok: boolean; message: string };
      revalidatePath(`/servers/${guildId}/twitch/controls`);
      revalidatePath(`/servers/${guildId}/twitch/logs`);
      return result;
    } catch {
      break;
    }
  }
  return { ok: false, message: 'The bot didn’t answer. Is it in chat? Check the Overview page.' };
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export async function saveQuote(
  guildId: string,
  input: { number?: number; text: string; game?: string | null },
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const text = input.text.trim().slice(0, 400);
  if (!text) return { ok: false, error: 'Write the quote.' };
  const game = input.game?.trim() || null;
  if (input.number) {
    await prisma.twitchQuote.updateMany({
      where: { guildId, number: input.number },
      data: { text, game },
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const guild = await tx.guild.update({
        where: { id: guildId },
        data: { twitchQuoteCounter: { increment: 1 } },
        select: { twitchQuoteCounter: true },
      });
      await tx.twitchQuote.create({
        data: { guildId, number: guild.twitchQuoteCounter, text, game, addedBy: 'dashboard' },
      });
    });
  }
  revalidatePath(`/servers/${guildId}/twitch/quotes`);
  return { ok: true };
}

export async function deleteQuoteAction(guildId: string, number: number): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  await prisma.twitchQuote.deleteMany({ where: { guildId, number } });
  revalidatePath(`/servers/${guildId}/twitch/quotes`);
  return { ok: true };
}

// ── Counters ────────────────────────────────────────────────────────────────

export async function saveCounter(
  guildId: string,
  name: string,
  value: number,
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const key = name.toLowerCase().trim();
  if (!/^(cmd:)?[a-z0-9_-]{1,40}$/.test(key)) {
    return { ok: false, error: 'Counter names use letters, numbers, _ and - (up to 40).' };
  }
  if (!Number.isInteger(value) || Math.abs(value) > 2_000_000_000) {
    return { ok: false, error: 'Use a whole number.' };
  }
  await prisma.twitchCounter.upsert({
    where: { guildId_name: { guildId, name: key } },
    create: { guildId, name: key, value },
    update: { value },
  });
  revalidatePath(`/servers/${guildId}/twitch/counters`);
  return { ok: true };
}

export async function deleteCounter(guildId: string, name: string): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  await prisma.twitchCounter.deleteMany({ where: { guildId, name } });
  revalidatePath(`/servers/${guildId}/twitch/counters`);
  return { ok: true };
}

// ── Song queue ──────────────────────────────────────────────────────────────

export async function songQueueAction(
  guildId: string,
  action: 'remove' | 'skip' | 'clear' | 'volume',
  value?: string | number,
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  if (action === 'remove' && typeof value === 'string') {
    await prisma.twitchSongRequest.updateMany({
      where: { guildId, id: value, status: 'queued' },
      data: { status: 'removed' },
    });
  } else if (action === 'skip') {
    await prisma.twitchSongRequest.updateMany({
      where: { guildId, status: 'playing' },
      data: { status: 'skipped' },
    });
  } else if (action === 'clear') {
    await prisma.twitchSongRequest.updateMany({
      where: { guildId, status: 'queued' },
      data: { status: 'removed' },
    });
  } else if (action === 'volume' && typeof value === 'number') {
    const volume = Math.max(0, Math.min(100, Math.round(value)));
    await getRedis().set(`twitchsongs:volume:${guildId}`, String(volume));
  }
  revalidatePath(`/servers/${guildId}/twitch/songs`);
  return { ok: true };
}
