import './load-env';
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type ClientEvents,
} from 'discord.js';
import { prisma } from '@solari/database';
import { env } from './env';
import { logger } from './logger';
import { captureError, initSentry } from './services/sentry';
import { ConfigCache } from './services/configCache';
import { JobService } from './services/jobs';
import { closeRedis, redis } from './services/redis';
import { guildGauge, startMetricsServer } from './services/metrics';
import { loadCommands, loadComponentHandlers, loadEvents } from './framework/loaders';
import { dispatchInteraction } from './framework/dispatch';
import { LiveCommandService } from './services/liveCommands';
import { QUEUE_NAMES } from '@solari/jobs';
import { handleTempActionExpire } from './jobs/handlers/tempActionExpire';
import { handleGiveawayEnd } from './jobs/handlers/giveawayEnd';
import { handleReminder } from './jobs/handlers/reminder';
import { handleScheduledMessage } from './jobs/handlers/scheduledMessage';
import { handleTicketAutoClose } from './jobs/handlers/ticketAutoClose';
import { handlePollEnd } from './jobs/handlers/pollEnd';
import { handleBirthdayAnnounce } from './jobs/handlers/birthdayAnnounce';
import { handleStatsCounterRefresh } from './jobs/handlers/statsCounterRefresh';
import { handleVoiceXp } from './jobs/handlers/voiceXp';
import { handleSocialPoll } from './jobs/handlers/socialPoll';
import { reconcileTickets } from './modules/tickets';
import { reconcileAfk } from './modules/afk';
import { reconcileBirthdays } from './modules/birthdays';
import { reconcileStatsCounters } from './modules/statsCounters';
import { reconcileVoiceXp } from './modules/leveling';
import { reconcileTempVoice } from './modules/tempVoice';
import { reconcileSocial } from './modules/social';
import { syncAllGuilds } from './lib/guildSync';
import { cacheAllGuildInvites } from './modules/inviteTracking';
import { createMusicManager } from './services/music';
import { CustomBotManager } from './services/customBots';
import type { BotContext } from './framework/context';

/**
 * Per-shard client bootstrap. Spawned by the ShardingManager in `index.ts`.
 *
 * Privileged intents (GuildMembers, MessageContent) must be enabled in the
 * Discord Developer Portal — member events and content-scanning automod need
 * them (§1.6).
 */
async function bootstrap(): Promise<void> {
  initSentry();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.GuildMember,
      Partials.User,
      Partials.Message,
      Partials.Reaction,
      Partials.Channel,
    ],
  });

  const config = new ConfigCache();
  const jobs = new JobService(client, logger);
  const music = env.MUSIC_ENABLED ? createMusicManager(client, logger, config) : null;
  const ctx: BotContext = { client, logger, prisma, config, jobs, redis, music };

  const [commands, events, componentHandlers] = await Promise.all([
    loadCommands(),
    loadEvents(),
    loadComponentHandlers(),
  ]);
  logger.info(
    { commands: commands.size, events: events.length, components: componentHandlers.size },
    'Loaded commands, events, and component handlers',
  );

  jobs.registerHandler(QUEUE_NAMES.tempActionExpire, handleTempActionExpire);
  jobs.registerHandler(QUEUE_NAMES.giveawayEnd, handleGiveawayEnd);
  jobs.registerHandler(QUEUE_NAMES.reminder, handleReminder);
  jobs.registerHandler(QUEUE_NAMES.scheduledMessage, handleScheduledMessage);
  jobs.registerHandler(QUEUE_NAMES.ticketAutoClose, handleTicketAutoClose);
  jobs.registerHandler(QUEUE_NAMES.pollEnd, handlePollEnd);
  jobs.registerHandler(QUEUE_NAMES.birthdayAnnounce, handleBirthdayAnnounce);
  jobs.registerHandler(QUEUE_NAMES.statsCounterRefresh, handleStatsCounterRefresh);
  jobs.registerHandler(QUEUE_NAMES.voiceXp, handleVoiceXp);
  jobs.registerHandler(QUEUE_NAMES.socialPoll, handleSocialPoll);

  // Premium per-guild custom bots (Bot Personalizer). Reuses the loaded commands
  // + handlers; each token runs an isolated client. Music stays on the main bot.
  const customBots = new CustomBotManager(
    { logger, prisma, config, jobs, redis, music },
    commands,
    componentHandlers,
    logger,
  );

  const liveCommands = new LiveCommandService(client, logger, jobs, config, customBots);

  for (const event of events) {
    const run = (...args: ClientEvents[typeof event.name]): void => {
      void Promise.resolve(event.execute(ctx, ...args)).catch((err: unknown) => {
        logger.error({ err, event: event.name }, 'Event handler error');
        captureError(err, { event: event.name });
      });
    };
    if (event.once) client.once(event.name, run);
    else client.on(event.name, run);
  }

  client.on(Events.InteractionCreate, (interaction) => {
    void dispatchInteraction(interaction, ctx, commands, componentHandlers).catch(
      (err: unknown) => {
        logger.error({ err }, 'Interaction dispatch error');
        captureError(err, {
          interaction: interaction.type,
          guildId: interaction.guildId ?? undefined,
        });
      },
    );
  });

  await config.start();
  await liveCommands.start();

  let stopMetrics: (() => Promise<void>) | null = null;

  client.once(Events.ClientReady, (ready) => {
    logger.info(
      { user: ready.user.tag, guilds: ready.guilds.cache.size, shards: ready.shard?.ids ?? [0] },
      'Shard ready',
    );
    ready.user.setActivity({ name: '/help', type: ActivityType.Listening });
    guildGauge.set(ready.guilds.cache.size);
    // Workers use the authed REST client, so start them once logged in.
    jobs.startWorkers();
    // Connect to Lavalink once we have the bot user id (Music module).
    if (music) {
      void music
        .init({ id: ready.user.id, username: ready.user.username })
        .then(() => logger.info('Lavalink manager initialised'))
        .catch((err: unknown) => logger.error({ err }, 'Lavalink init failed'));
    }
    // Re-arm any durable timers from the DB (source of truth) for guilds this
    // shard owns — self-heals after a restart or a lost enqueue.
    void Promise.allSettled([
      syncAllGuilds(ready),
      jobs.reconcile(),
      jobs.reconcileReminders(),
      jobs.reconcileScheduledMessages(),
      reconcileTickets(ready, jobs, logger),
      reconcileAfk(ready),
      reconcileBirthdays(ready, jobs),
      reconcileStatsCounters(ready, jobs),
      reconcileVoiceXp(ready, jobs),
      reconcileTempVoice(ready, prisma, logger),
      reconcileSocial(ready, jobs, logger),
      customBots.reconcile(),
      cacheAllGuildInvites(ready.guilds.cache.values()),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected')
          logger.error({ err: result.reason }, 'Durable-job reconcile failed');
      }
    });
    stopMetrics = startMetricsServer(ready.shard?.ids[0] ?? 0);
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down shard');
    try {
      await customBots.closeAll();
      await jobs.close();
      if (stopMetrics) await stopMetrics();
      await closeRedis();
      await prisma.$disconnect();
      await client.destroy();
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await client.login(env.DISCORD_TOKEN);
}

bootstrap().catch((err: unknown) => {
  logger.error({ err }, 'Fatal error during client bootstrap');
  captureError(err, { phase: 'bootstrap' });
  process.exit(1);
});
