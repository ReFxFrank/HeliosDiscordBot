'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@solari/database';
import { assertCanManage, requireSession } from './auth-guards';
import { encryptSecret } from './crypto';
import { publishLiveCommand } from './redis';

export interface PersonalizerResult {
  ok: boolean;
  error?: string;
}

/** Identity/presence fields the dashboard can edit (never includes the token). */
export interface CustomBotInput {
  applicationId: string | null;
  botName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  status: string;
  activityType: string | null;
  activityText: string | null;
  streamUrl: string | null;
  enabled: boolean;
  /** A NEW token to store, or null/empty to keep the existing one. */
  token?: string | null;
}

const VALID_STATUS = new Set(['online', 'idle', 'dnd', 'invisible']);
const VALID_ACTIVITY = new Set(['PLAYING', 'LISTENING', 'WATCHING', 'COMPETING', 'STREAMING']);

async function requirePremiumManager(guildId: string): Promise<PersonalizerResult | null> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { premiumTier: true },
  });
  if (guild?.premiumTier !== 'PREMIUM') {
    return { ok: false, error: 'The Bot Personalizer is a Premium feature.' };
  }
  return null;
}

/**
 * Create/update a guild's custom bot. The token is AES-256-GCM encrypted before
 * it ever touches the database and is never returned to the client. Enabling
 * without a stored token is rejected. Publishes a live restart so the bot picks
 * up the change immediately.
 */
export async function saveCustomBot(
  guildId: string,
  input: CustomBotInput,
): Promise<PersonalizerResult> {
  const denied = await requirePremiumManager(guildId);
  if (denied) return denied;

  if (!VALID_STATUS.has(input.status)) return { ok: false, error: 'Invalid status.' };
  if (input.activityType && !VALID_ACTIVITY.has(input.activityType)) {
    return { ok: false, error: 'Invalid activity type.' };
  }

  const existing = await prisma.customBot.findUnique({
    where: { guildId },
    select: { tokenEnc: true },
  });
  const newToken = input.token?.trim();
  if (!newToken && !existing) {
    return { ok: false, error: 'A bot token is required to set up your custom bot.' };
  }
  if (input.enabled && !newToken && !existing) {
    return { ok: false, error: 'Add a bot token before enabling.' };
  }

  const identity = {
    applicationId: input.applicationId?.trim() || null,
    botName: input.botName?.trim() || null,
    avatarUrl: input.avatarUrl?.trim() || null,
    bannerUrl: input.bannerUrl?.trim() || null,
    status: input.status,
    activityType: input.activityType,
    activityText: input.activityText?.trim() || null,
    streamUrl: input.streamUrl?.trim() || null,
    enabled: input.enabled,
  };

  try {
    const tokenEnc = newToken ? encryptSecret(newToken) : undefined;
    await prisma.customBot.upsert({
      where: { guildId },
      update: { ...identity, ...(tokenEnc ? { tokenEnc } : {}) },
      // A create must have a token (guarded above).
      create: { guildId, tokenEnc: tokenEnc ?? '', ...identity },
    });
    await publishLiveCommand(guildId, 'RESTART_CUSTOM_BOT', {});
    revalidatePath(`/servers/${guildId}/personalizer`);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save the custom bot.' };
  }
}

/** Turn the custom bot on/off (and restart/stop it live). */
export async function setCustomBotEnabled(
  guildId: string,
  enabled: boolean,
): Promise<PersonalizerResult> {
  const denied = await requirePremiumManager(guildId);
  if (denied) return denied;
  try {
    const row = await prisma.customBot.findUnique({ where: { guildId }, select: { tokenEnc: true } });
    if (!row?.tokenEnc) return { ok: false, error: 'Set up your custom bot first.' };
    await prisma.customBot.update({ where: { guildId }, data: { enabled } });
    await publishLiveCommand(guildId, 'RESTART_CUSTOM_BOT', {});
    revalidatePath(`/servers/${guildId}/personalizer`);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update the custom bot.' };
  }
}

/** Remove the custom bot entirely (and stop it live). */
export async function deleteCustomBot(guildId: string): Promise<PersonalizerResult> {
  const denied = await requirePremiumManager(guildId);
  if (denied) return denied;
  try {
    await prisma.customBot.deleteMany({ where: { guildId } });
    await publishLiveCommand(guildId, 'RESTART_CUSTOM_BOT', {});
    revalidatePath(`/servers/${guildId}/personalizer`);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not remove the custom bot.' };
  }
}
