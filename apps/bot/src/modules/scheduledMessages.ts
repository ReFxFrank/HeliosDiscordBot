import type { Client } from 'discord.js';
import { prisma } from '@refx/database';
import { QUEUE_NAMES } from '@refx/jobs';
import { computeNextRun, type ScheduleRepeat } from '@refx/shared';
import type { Logger } from '../logger';
import { scheduledMessageJobId, type JobService } from '../services/jobs';

export interface ScheduledMessageDeps {
  client: Client;
  logger: Logger;
  jobs: JobService;
}

async function postToChannel(
  deps: ScheduledMessageDeps,
  guildId: string,
  channelId: string,
  content: string,
): Promise<void> {
  const guild = deps.client.guilds.cache.get(guildId);
  const channel =
    guild?.channels.cache.get(channelId) ??
    (await guild?.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  await channel
    .send({ content })
    .catch((err: unknown) => deps.logger.warn({ err, channelId }, 'Scheduled message post failed'));
}

/**
 * Post a scheduled message and, if it repeats, re-arm the next run. A one-off
 * flips `enabled` off so a startup reconcile won't resurrect it.
 */
export async function fireScheduledMessage(id: string, deps: ScheduledMessageDeps): Promise<void> {
  const message = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!message || !message.enabled) return;

  await postToChannel(deps, message.guildId, message.channelId, message.content);

  const next = computeNextRun(message.nextRunAt, message.repeat as ScheduleRepeat, new Date());
  if (next) {
    await prisma.scheduledMessage.update({
      where: { id },
      data: { lastRunAt: new Date(), nextRunAt: next },
    });
    await deps.jobs.schedule(
      QUEUE_NAMES.scheduledMessage,
      'scheduledMessage',
      { scheduledMessageId: id },
      { delayMs: next.getTime() - Date.now(), jobId: scheduledMessageJobId(id) },
    );
  } else {
    await prisma.scheduledMessage.update({
      where: { id },
      data: { lastRunAt: new Date(), enabled: false },
    });
  }
}

/**
 * (Re)arm the next run for a scheduled message from its stored `nextRunAt`.
 * Invoked over the live-command path when the dashboard creates or edits one.
 */
export async function armScheduledMessage(id: string, deps: ScheduledMessageDeps): Promise<void> {
  const message = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!message || !message.enabled) return;
  await deps.jobs.schedule(
    QUEUE_NAMES.scheduledMessage,
    'scheduledMessage',
    { scheduledMessageId: id },
    {
      delayMs: Math.max(0, message.nextRunAt.getTime() - Date.now()),
      jobId: scheduledMessageJobId(id),
    },
  );
}
