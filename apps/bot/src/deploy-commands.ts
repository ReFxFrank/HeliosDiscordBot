import './load-env';
import { REST, Routes } from 'discord.js';
import { env } from './env';
import { logger } from './logger';
import { loadCommands } from './framework/loaders';

/**
 * Register slash commands (§5.1, §12). With DEV_GUILD_ID set, registers
 * guild-scoped commands (instant updates) for fast dev iteration; otherwise
 * registers globally (propagation can take up to an hour).
 *
 * IMPORTANT: guild-scoped commands only exist in that ONE guild — every other
 * server sees no commands at all. Production should leave DEV_GUILD_ID unset.
 * When switching from guild-scoped to global, clear the old guild set (or the
 * dev guild shows every command twice):
 *
 *   pnpm deploy:commands -- --clear-guild <guildId>
 */
async function main(): Promise<void> {
  const rest = new REST().setToken(env.DISCORD_TOKEN);

  // Optional cleanup: wipe a guild's scoped command set, then continue.
  const clearIndex = process.argv.indexOf('--clear-guild');
  const clearGuildId = clearIndex !== -1 ? process.argv[clearIndex + 1] : undefined;
  if (clearGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, clearGuildId), {
      body: [],
    });
    logger.info({ guild: clearGuildId }, 'Cleared guild-scoped commands');
  }

  const commands = await loadCommands();
  const body = [...commands.values()].map((command) => command.data.toJSON());

  if (env.DEV_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID), {
      body,
    });
    logger.info({ count: body.length, guild: env.DEV_GUILD_ID }, 'Registered guild commands (dev)');
    logger.warn(
      'DEV_GUILD_ID is set: commands exist ONLY in that guild. Unset it in production so every server gets them.',
    );
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
    logger.info({ count: body.length }, 'Registered global commands');
  }
}

// Exit explicitly: loading the command modules transitively opens the bot's
// eager Redis connections (services/redis.ts), whose reconnect retries keep
// the event loop alive so the process would otherwise hang after registering —
// and spam connection errors while it does. Registration is already done here.
main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error({ err }, 'Failed to deploy commands');
    process.exit(1);
  });
