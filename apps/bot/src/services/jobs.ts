import { Queue, Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, QUEUE_PREFIX, type TempActionExpireJob } from '@solari/jobs';
import type { Client } from 'discord.js';
import { prisma, type PrismaClient } from '@solari/database';
import type { Logger } from '../logger';
import { bullConnection } from './redis';
import { captureError } from './sentry';

/** Dependencies handed to job handlers. */
export interface JobContext {
  client: Client;
  prisma: PrismaClient;
  logger: Logger;
  /** The owning service, so a handler can re-arm a recurring job. */
  jobs: JobService;
}

export type JobHandler<TData = unknown> = (data: TData, ctx: JobContext) => Promise<void>;

export interface ScheduleOptions {
  delayMs?: number;
  /** Idempotency key — re-scheduling with the same id replaces the prior job. */
  jobId?: string;
  attempts?: number;
}

/**
 * Durable job service (§5.4). Owns BullMQ Queues (enqueue) and Workers
 * (process) inside the bot process. Handlers are registered per queue and a
 * Worker is spun up for each at startup. Because jobs live in Redis, every
 * scheduled effect survives a restart.
 */
export class JobService {
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly handlers = new Map<string, JobHandler>();
  private readonly ctx: JobContext;

  constructor(client: Client, logger: Logger) {
    this.ctx = { client, prisma, logger, jobs: this };
  }

  /** Register the handler for a queue. Call before `startWorkers`. */
  registerHandler<TData>(queueName: string, handler: JobHandler<TData>): void {
    this.handlers.set(queueName, handler as JobHandler);
  }

  private queue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: bullConnection, prefix: QUEUE_PREFIX });
      this.queues.set(name, queue);
    }
    return queue;
  }

  /**
   * Schedule (or reschedule) a job. With a `jobId`, this is idempotent: any
   * existing job for that id is removed first, so a new delay actually wins
   * (BullMQ no-ops `add()` on a duplicate id) and a stale failed-job key can't
   * block re-scheduling. Failures retry with backoff.
   */
  async schedule(
    queueName: string,
    jobName: string,
    data: unknown,
    options: ScheduleOptions = {},
  ): Promise<void> {
    const queue = this.queue(queueName);
    if (options.jobId) await queue.remove(options.jobId).catch(() => undefined);
    await queue.add(jobName, data, {
      delay: Math.max(0, options.delayMs ?? 0),
      jobId: options.jobId,
      attempts: options.attempts ?? 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }

  /**
   * Arm a job only if one with the same id isn't already queued. Unlike
   * `schedule` (which removes-then-adds, resetting the delay), this no-ops when
   * a job already exists — so kicking a live self-rescheduling loop can't starve
   * it by perpetually pushing the next run back.
   */
  async ensureScheduled(
    queueName: string,
    jobName: string,
    data: unknown,
    options: ScheduleOptions = {},
  ): Promise<void> {
    if (options.jobId) {
      const existing = await this.queue(queueName).getJob(options.jobId);
      if (existing) return;
    }
    await this.queue(queueName).add(jobName, data, {
      delay: Math.max(0, options.delayMs ?? 0),
      jobId: options.jobId,
      attempts: options.attempts ?? 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }

  /** Cancel a scheduled job by id. */
  async cancel(queueName: string, jobId: string): Promise<void> {
    const job = await this.queue(queueName).getJob(jobId);
    await job?.remove().catch(() => undefined);
  }

  /**
   * Arm a REPEATING job via BullMQ's native job scheduler — the correct
   * primitive for recurring work. A handler cannot reliably re-arm its own
   * jobId from inside itself (BullMQ no-ops `add()` while the job key is still
   * locked/active, then `removeOnComplete` deletes it, so the loop dies after
   * one run). The scheduler re-arms after each run completes. Idempotent per
   * `schedulerId`; safe to call repeatedly (e.g. from reconcile).
   */
  async scheduleRecurring(
    queueName: string,
    schedulerId: string,
    everyMs: number,
    jobName: string,
    data: unknown,
  ): Promise<void> {
    await this.queue(queueName).upsertJobScheduler(
      schedulerId,
      { every: Math.max(1000, everyMs) },
      {
        name: jobName,
        data,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      },
    );
  }

  /**
   * Arm a job on a cron schedule (e.g. a daily run at a fixed UTC hour) via
   * BullMQ's native scheduler. Same rationale as `scheduleRecurring`: a handler
   * can't reliably re-arm its own jobId, so the scheduler owns the cadence.
   * Idempotent per `schedulerId`; re-calling updates the pattern.
   */
  async scheduleCron(
    queueName: string,
    schedulerId: string,
    pattern: string,
    jobName: string,
    data: unknown,
    tz = 'UTC',
  ): Promise<void> {
    await this.queue(queueName).upsertJobScheduler(
      schedulerId,
      { pattern, tz },
      {
        name: jobName,
        data,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      },
    );
  }

  /** Stop a repeating job scheduler (safe if it doesn't exist). */
  async cancelRecurring(queueName: string, schedulerId: string): Promise<void> {
    await this.queue(queueName)
      .removeJobScheduler(schedulerId)
      .catch(() => undefined);
  }

  // ── Temp-action convenience (moderation) ──────────────────────────────────

  async scheduleTempAction(
    data: TempActionExpireJob,
    delayMs: number,
    jobId: string,
  ): Promise<void> {
    await this.schedule(QUEUE_NAMES.tempActionExpire, 'tempActionExpire', data, { delayMs, jobId });
  }

  async cancelTempAction(jobId: string): Promise<void> {
    await this.cancel(QUEUE_NAMES.tempActionExpire, jobId);
  }

  /**
   * Re-arm scheduled temp-actions from the database (source of truth) on
   * startup for guilds this shard owns — self-heals after a restart or a lost
   * enqueue.
   */
  async reconcile(): Promise<void> {
    const guildIds = [...this.ctx.client.guilds.cache.keys()];
    if (guildIds.length === 0) return;
    const cases = await prisma.moderationCase.findMany({
      where: { type: 'TEMPBAN', active: true, expiresAt: { not: null }, guildId: { in: guildIds } },
      select: { id: true, guildId: true, targetId: true, expiresAt: true },
    });
    for (const moderationCase of cases) {
      if (!moderationCase.expiresAt) continue;
      await this.scheduleTempAction(
        {
          type: 'UNBAN',
          guildId: moderationCase.guildId,
          userId: moderationCase.targetId,
          caseId: moderationCase.id,
        },
        moderationCase.expiresAt.getTime() - Date.now(),
        tempBanJobId(moderationCase.guildId, moderationCase.targetId),
      );
    }
    this.ctx.logger.info({ count: cases.length }, 'Reconciled scheduled temp-actions');
  }

  /** Re-arm pending reminders for guilds this shard owns (self-heal on boot). */
  async reconcileReminders(): Promise<void> {
    const guildIds = [...this.ctx.client.guilds.cache.keys()];
    if (guildIds.length === 0) return;
    const reminders = await prisma.reminder.findMany({
      where: { guildId: { in: guildIds } },
      select: { id: true, remindAt: true },
    });
    for (const reminder of reminders) {
      await this.schedule(
        QUEUE_NAMES.reminder,
        'reminder',
        { reminderId: reminder.id },
        { delayMs: reminder.remindAt.getTime() - Date.now(), jobId: reminderJobId(reminder.id) },
      );
    }
    this.ctx.logger.info({ count: reminders.length }, 'Reconciled reminders');
  }

  /** Re-arm enabled scheduled messages for guilds this shard owns. */
  async reconcileScheduledMessages(): Promise<void> {
    const guildIds = [...this.ctx.client.guilds.cache.keys()];
    if (guildIds.length === 0) return;
    const messages = await prisma.scheduledMessage.findMany({
      where: { enabled: true, guildId: { in: guildIds } },
      select: { id: true, nextRunAt: true },
    });
    for (const message of messages) {
      await this.schedule(
        QUEUE_NAMES.scheduledMessage,
        'scheduledMessage',
        { scheduledMessageId: message.id },
        {
          delayMs: message.nextRunAt.getTime() - Date.now(),
          jobId: scheduledMessageJobId(message.id),
        },
      );
    }
    this.ctx.logger.info({ count: messages.length }, 'Reconciled scheduled messages');
  }

  /** Start a Worker for every registered handler. Call after login. */
  startWorkers(): void {
    for (const [name, handler] of this.handlers) {
      const worker = new Worker(name, (job: Job) => handler(job.data, this.ctx), {
        connection: bullConnection,
        prefix: QUEUE_PREFIX,
      });
      worker.on('failed', (job, err) => {
        this.ctx.logger.error({ err, jobId: job?.id, queue: name }, 'Job failed');
        captureError(err, { queue: name, jobId: job?.id });
      });
      this.workers.push(worker);
    }
    this.ctx.logger.info({ workers: this.workers.length }, 'Job workers started');
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      ...this.workers.map((worker) => worker.close()),
      ...[...this.queues.values()].map((queue) => queue.close()),
    ]);
  }
}

/** Stable job id for a guild member's temp-ban expiry (no `:` — BullMQ keys). */
export function tempBanJobId(guildId: string, userId: string): string {
  return `tempban-${guildId}-${userId}`;
}

/** Stable job id for a giveaway's scheduled end. */
export function giveawayJobId(giveawayId: string): string {
  return `giveaway-${giveawayId}`;
}

/** Stable job id for a poll's scheduled close. */
export function pollJobId(pollId: string): string {
  return `poll-${pollId}`;
}

/** Stable job id for a reminder's delivery. */
export function reminderJobId(reminderId: string): string {
  return `reminder-${reminderId}`;
}

/** Stable job id for a scheduled message's next run. */
export function scheduledMessageJobId(scheduledMessageId: string): string {
  return `scheduledmsg-${scheduledMessageId}`;
}

/** Stable job id for a ticket's inactivity auto-close. */
export function ticketJobId(ticketId: string): string {
  return `ticket-${ticketId}`;
}

/** Stable job id for a guild's daily birthday announcement. */
export function birthdayJobId(guildId: string): string {
  return `birthday-${guildId}`;
}

/** Stable job id for a guild's stats-counter refresh. */
export function statsCounterJobId(guildId: string): string {
  return `stats-${guildId}`;
}

/** Stable job id for a guild's recurring voice-XP tick. */
export function voiceXpJobId(guildId: string): string {
  return `voicexp-${guildId}`;
}
