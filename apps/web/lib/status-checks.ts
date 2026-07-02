import { prisma } from '@solari/database';
import { getRedis } from './redis';

/**
 * Live component probes for the public /status page. Each check races a short
 * deadline so a dead dependency degrades the page to "outage" instead of
 * hanging the render.
 */

export interface ProbeResult {
  ok: boolean;
  /** Round-trip latency in ms; null when the probe failed or timed out. */
  latencyMs: number | null;
}

const DEADLINE_MS = 1500;

async function probe(run: () => Promise<unknown>): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    const outcome = await Promise.race([
      run().then(() => true as const),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), DEADLINE_MS)),
    ]);
    return outcome ? { ok: true, latencyMs: Date.now() - startedAt } : { ok: false, latencyMs: null };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

/** PostgreSQL round trip (the same pool the dashboard serves from). */
export function checkDatabase(): Promise<ProbeResult> {
  return probe(() => prisma.$queryRaw`SELECT 1`);
}

/** Redis round trip (config cache, live commands, job queues). */
export function checkRedis(): Promise<ProbeResult> {
  return probe(() => getRedis().ping());
}
