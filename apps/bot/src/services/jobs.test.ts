import { afterAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { QUEUE_NAMES, QUEUE_PREFIX, type TempActionExpireJob } from '@refx/jobs';
import type { Client } from 'discord.js';
import { logger } from '../logger';
import { JobService, tempBanJobId } from './jobs';
import { bullConnection, closeRedis } from './redis';

const RUN = process.env.VITEST_SKIP_INTEGRATION !== '1';
const suite = RUN ? describe : describe.skip;

suite('JobService durable scheduling (integration)', () => {
  afterAll(async () => {
    await closeRedis();
  });

  it('persists a delayed job in Redis and processes it from a worker started later (restart survival)', async () => {
    const guildId = `test-guild-jobs-${Date.now()}`;
    const userId = 'target-1';
    const jobId = tempBanJobId(guildId, userId);

    // A JobService never starts its worker here — we only enqueue, then spin up
    // a *fresh* worker afterwards to simulate the process having restarted.
    const jobs = new JobService({} as unknown as Client, logger);
    await jobs.cancelTempAction(jobId); // clear any leftover from a previous run
    await jobs.scheduleTempAction({ type: 'UNBAN', guildId, userId }, 800, jobId);

    // The job exists in Redis, independent of the enqueuing process.
    const inspectQueue = new Queue(QUEUE_NAMES.tempActionExpire, {
      connection: bullConnection,
      prefix: QUEUE_PREFIX,
    });
    const stored = await inspectQueue.getJob(jobId);
    expect(stored).not.toBeNull();
    expect(stored?.data.guildId).toBe(guildId);
    expect(stored?.processedOn).toBeFalsy(); // not yet processed

    // Simulate a restart: a brand-new worker picks up the persisted job.
    const processed = new Promise<TempActionExpireJob>((resolve) => {
      const worker = new Worker<TempActionExpireJob>(
        QUEUE_NAMES.tempActionExpire,
        (job) => {
          resolve(job.data);
          return Promise.resolve();
        },
        { connection: bullConnection, prefix: QUEUE_PREFIX },
      );
      worker.on('error', () => undefined);
    });

    const data = await processed;
    expect(data).toMatchObject({ type: 'UNBAN', guildId, userId });

    await inspectQueue.close();
    await jobs.close();
  });

  it('reschedules an existing job so a new duration replaces the old one', async () => {
    const guildId = `test-guild-jobs-resched-${Date.now()}`;
    const jobId = tempBanJobId(guildId, 'u');
    const jobs = new JobService({} as unknown as Client, logger);
    const queue = new Queue(QUEUE_NAMES.tempActionExpire, {
      connection: bullConnection,
      prefix: QUEUE_PREFIX,
    });

    await jobs.scheduleTempAction({ type: 'UNBAN', guildId, userId: 'u' }, 60_000, jobId);
    expect((await queue.getJob(jobId))?.opts.delay).toBe(60_000);

    // Re-schedule with a different delay — must replace, not silently no-op.
    await jobs.scheduleTempAction({ type: 'UNBAN', guildId, userId: 'u' }, 1234, jobId);
    expect((await queue.getJob(jobId))?.opts.delay).toBe(1234);

    await queue.remove(jobId).catch(() => undefined);
    await queue.close();
    await jobs.close();
  });

  it('cancelTempAction removes a scheduled job', async () => {
    const guildId = `test-guild-jobs-cancel-${Date.now()}`;
    const jobId = tempBanJobId(guildId, 'u');
    const jobs = new JobService({} as unknown as Client, logger);

    await jobs.scheduleTempAction({ type: 'UNBAN', guildId, userId: 'u' }, 60_000, jobId);
    const queue = new Queue(QUEUE_NAMES.tempActionExpire, {
      connection: bullConnection,
      prefix: QUEUE_PREFIX,
    });
    expect(await queue.getJob(jobId)).not.toBeNull();

    await jobs.cancelTempAction(jobId);
    expect(await queue.getJob(jobId)).toBeUndefined();

    await queue.close();
    await jobs.close();
  });
});
