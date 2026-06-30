import './load-env';
import { env } from './env';
import { logger } from './logger';

/**
 * Phase 0 bootstrap. This validates the environment, brings up structured
 * logging, and installs graceful-shutdown handlers — the spine that Phase 1
 * builds the sharded Discord client and BullMQ workers on top of.
 *
 * Discord gateway wiring intentionally does not run yet: Phase 0's acceptance
 * criteria are infra + typecheck/lint, not a live gateway connection.
 */
async function main(): Promise<void> {
  logger.info(
    {
      nodeEnv: env.NODE_ENV,
      owners: env.OWNER_IDS.length,
      devGuild: env.DEV_GUILD_ID ?? null,
    },
    'Helios bot — Phase 0 scaffold booted. Discord gateway + commands arrive in Phase 1.',
  );

  // Phase 1 will spawn the ShardingManager here, e.g.:
  //   const manager = new ShardingManager(new URL('./client.ts', import.meta.url).pathname, {
  //     token: env.DISCORD_TOKEN,
  //     totalShards: 'auto',
  //   });
  //   await manager.spawn();

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Received shutdown signal, exiting.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Fatal error during bot startup');
  process.exit(1);
});
