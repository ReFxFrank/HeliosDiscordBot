import './load-env';
import { logger } from './logger';

/**
 * Slash-command registration script (§5.1, §12). In dev it will register
 * guild-scoped commands (instant updates) using DEV_GUILD_ID; in prod it
 * registers globally. Phase 0 has no commands yet — this is the entry point
 * Phase 1 fills in.
 */
async function main(): Promise<void> {
  logger.info('No slash commands to deploy yet — command registration arrives in Phase 1.');
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Failed to deploy commands');
  process.exit(1);
});
