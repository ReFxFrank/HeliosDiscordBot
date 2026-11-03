import './load-env';
import { fileURLToPath } from 'node:url';
import { ShardingManager } from 'discord.js';
import { env } from './env';
import { logger } from './logger';
import { captureError, flushSentry, initSentry } from './services/sentry';

/**
 * ShardingManager entry (§4.5). Spawns the per-shard client in `client.ts`.
 *
 * The shard children are forked with `--import tsx` so they can run the
 * TypeScript entry directly (matching how the parent is launched), without a
 * separate build step.
 */
async function main(): Promise<void> {
  // The shard children re-init Sentry in their own processes; this covers the
  // supervisor itself (spawn failures, respawn loops, the fatal path below).
  initSentry();

  const shardFile = fileURLToPath(new URL('./client.ts', import.meta.url));

  const manager = new ShardingManager(shardFile, {
    token: env.DISCORD_TOKEN,
    totalShards: 'auto',
    execArgv: ['--import', 'tsx'],
    respawn: true,
  });

  manager.on('shardCreate', (shard) => {
    logger.info({ shard: shard.id }, 'Launching shard');
    shard.on('death', () => logger.error({ shard: shard.id }, 'Shard process died'));
  });

  await manager.spawn();
  logger.info({ shards: manager.totalShards }, 'All shards spawned');
}

main().catch(async (err: unknown) => {
  logger.error({ err }, 'Fatal error in sharding manager');
  captureError(err, { phase: 'sharding-manager' });
  await flushSentry();
  process.exit(1);
});
