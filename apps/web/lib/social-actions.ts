'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@refx/database';
import {
  SOCIAL_MAX_PER_GUILD,
  socialSubscriptionInputSchema,
  type SocialSubscriptionInput,
} from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';
import { publishLiveCommand } from './redis';

export interface SocialActionResult {
  ok: boolean;
  error?: string;
}

/** Twitch needs app credentials on the host; the other platforms need none. */
function twitchConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

/**
 * Add an alert. The row is created here; the bot then baselines it to the
 * source's current latest item (so the backlog isn't dumped into the channel)
 * and starts polling, on the SOCIAL_SUBSCRIBE live command.
 */
export async function createSocialSubscription(
  guildId: string,
  input: SocialSubscriptionInput,
): Promise<SocialActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const parsed = socialSubscriptionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the alert details.' };
  }
  const { platform, target, channelId, mentionRoleId } = parsed.data;
  if (platform === 'twitch' && !twitchConfigured()) {
    return {
      ok: false,
      error: 'Twitch alerts need the Twitch app credentials set on the bot host.',
    };
  }

  const existing = await prisma.socialSubscription.findMany({
    where: { guildId },
    select: { platform: true, target: true, channelId: true },
  });
  if (existing.length >= SOCIAL_MAX_PER_GUILD) {
    return {
      ok: false,
      error: `This server already has the maximum of ${SOCIAL_MAX_PER_GUILD} alerts.`,
    };
  }
  if (
    existing.some(
      (s) => s.platform === platform && s.target === target && s.channelId === channelId,
    )
  ) {
    return { ok: false, error: 'That alert already exists for this channel.' };
  }

  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
  const created = await prisma.socialSubscription.create({
    data: { guildId, platform, target, channelId, mentionRoleId },
  });
  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'SOCIAL_ALERT_CREATED',
    module: 'SOCIAL',
    after: { platform, target, channelId },
  });
  await publishLiveCommand(guildId, 'SOCIAL_SUBSCRIBE', { subscriptionId: created.id });
  revalidatePath(`/servers/${guildId}/social`);
  return { ok: true };
}

export async function deleteSocialSubscription(
  guildId: string,
  id: string,
): Promise<SocialActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const row = await prisma.socialSubscription.findUnique({ where: { id } });
  if (!row || row.guildId !== guildId) return { ok: false, error: 'Not found.' };

  await prisma.socialSubscription.delete({ where: { id } });
  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'SOCIAL_ALERT_DELETED',
    module: 'SOCIAL',
    before: { platform: row.platform, target: row.target, channelId: row.channelId },
  });
  await publishLiveCommand(guildId, 'SOCIAL_UNSUBSCRIBE', { subscriptionId: id });
  revalidatePath(`/servers/${guildId}/social`);
  return { ok: true };
}
