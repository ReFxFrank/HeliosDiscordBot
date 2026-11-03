'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@refx/database';
import { scheduledMessageInputSchema, type ScheduledMessageInput } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';
import { publishLiveCommand } from './redis';

export interface ScheduledActionResult {
  ok: boolean;
  error?: string;
}

async function ensureGuild(guildId: string): Promise<void> {
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
}

function revalidate(guildId: string): void {
  revalidatePath(`/servers/${guildId}/scheduled`);
}

export async function createScheduledMessage(
  guildId: string,
  input: ScheduledMessageInput,
): Promise<ScheduledActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const parsed = scheduledMessageInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the channel ID, message, and time.' };

  await ensureGuild(guildId);
  const message = await prisma.scheduledMessage.create({
    data: {
      guildId,
      channelId: parsed.data.channelId,
      name: parsed.data.name?.trim() || null,
      content: parsed.data.content,
      repeat: parsed.data.repeat,
      nextRunAt: new Date(parsed.data.firstRunAt),
      createdBy: session.user.id,
    },
  });

  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'SCHEDULED_MESSAGE_CREATED',
    module: 'SCHEDULED_MESSAGES',
    after: { channelId: parsed.data.channelId, repeat: parsed.data.repeat },
  });

  await publishLiveCommand(guildId, 'SCHEDULE_MESSAGE', { scheduledMessageId: message.id });
  revalidate(guildId);
  return { ok: true };
}

export async function toggleScheduledMessage(
  guildId: string,
  id: string,
  enabled: boolean,
): Promise<ScheduledActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const message = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!message || message.guildId !== guildId) return { ok: false, error: 'Not found.' };

  await prisma.scheduledMessage.update({ where: { id }, data: { enabled } });
  if (enabled) {
    await publishLiveCommand(guildId, 'SCHEDULE_MESSAGE', { scheduledMessageId: id });
  } else {
    await publishLiveCommand(guildId, 'CANCEL_SCHEDULED_MESSAGE', { scheduledMessageId: id });
  }
  revalidate(guildId);
  return { ok: true };
}

export async function deleteScheduledMessage(
  guildId: string,
  id: string,
): Promise<ScheduledActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const message = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!message || message.guildId !== guildId) return { ok: false, error: 'Not found.' };

  await publishLiveCommand(guildId, 'CANCEL_SCHEDULED_MESSAGE', { scheduledMessageId: id });
  await prisma.scheduledMessage.delete({ where: { id } });
  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'SCHEDULED_MESSAGE_DELETED',
    module: 'SCHEDULED_MESSAGES',
    before: { channelId: message.channelId, content: message.content.slice(0, 100) },
  });
  revalidate(guildId);
  return { ok: true };
}
