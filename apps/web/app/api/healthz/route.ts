import { prisma } from '@refx/database';
import { getRedis } from '../../../lib/redis';

export const dynamic = 'force-dynamic';

/**
 * Unauthenticated liveness probe for uptime monitors. Pings Postgres and Redis
 * and returns only up/down booleans — nothing sensitive is exposed. 200 when
 * every dependency is up, 503 otherwise.
 */
export async function GET(): Promise<Response> {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
  const healthy = db && redis;
  return Response.json(
    { status: healthy ? 'ok' : 'degraded', db, redis },
    { status: healthy ? 200 : 503 },
  );
}

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
