import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type PresenceStatusData,
} from 'discord.js';
import { prisma } from '@solari/database';
import { decryptSecret } from '../lib/crypto';
import { dispatchInteraction } from '../framework/dispatch';
import type { Command } from '../framework/command';
import type { ComponentHandler } from '../framework/component';
import type { BotContext } from '../framework/context';
import type { Logger } from '../logger';

/** Everything a custom bot shares with the main bot except its own client. */
type BaseContext = Omit<BotContext, 'client'>;

/** The stored row shape (the sandbox Prisma client is stale, so type it locally). */
interface CustomBotRow {
  guildId: string;
  tokenEnc: string;
  botName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  status: string;
  activityType: string | null;
  activityText: string | null;
  streamUrl: string | null;
  enabled: boolean;
}

const STATUS: Record<string, PresenceStatusData> = {
  online: 'online',
  idle: 'idle',
  dnd: 'dnd',
  invisible: 'invisible',
};

const ACTIVITY: Record<string, ActivityType> = {
  PLAYING: ActivityType.Playing,
  LISTENING: ActivityType.Listening,
  WATCHING: ActivityType.Watching,
  COMPETING: ActivityType.Competing,
  STREAMING: ActivityType.Streaming,
};

/**
 * Runs each premium guild's own bot (the Bot Personalizer). Every custom bot
 * reuses the main bot's commands, component handlers and dispatch — only the
 * client (its Discord identity) differs — so behaviour never diverges. Each bot
 * is isolated: a bad token or a crash in one can't take down the others or the
 * main bot.
 *
 * Kept deliberately self-contained (constructed once with its dependencies) so
 * it can later be lifted into a separate worker process without a rewrite.
 */
export class CustomBotManager {
  private readonly clients = new Map<string, Client>();

  constructor(
    private readonly base: BaseContext,
    private readonly commands: Map<string, Command>,
    private readonly componentHandlers: Map<string, ComponentHandler>,
    private readonly logger: Logger,
  ) {}

  /** Boot every enabled custom bot at startup; failures are isolated per bot. */
  async reconcile(): Promise<void> {
    let rows: CustomBotRow[];
    try {
      rows = (await prisma.customBot.findMany({ where: { enabled: true } })) as CustomBotRow[];
    } catch (err) {
      this.logger.error({ err }, 'Custom-bot reconcile query failed');
      return;
    }
    for (const row of rows) {
      await this.start(row.guildId).catch((err: unknown) =>
        this.logger.error({ err, guildId: row.guildId }, 'Custom bot failed to start'),
      );
    }
    this.logger.info({ count: rows.length }, 'Custom bots reconciled');
  }

  /** (Re)start a guild's custom bot from the DB. A disabled/absent row just stops it. */
  async start(guildId: string): Promise<void> {
    await this.stop(guildId); // never run two clients for one guild
    const row = (await prisma.customBot.findUnique({
      where: { guildId },
    })) as CustomBotRow | null;
    if (!row || !row.enabled) return;

    let token: string;
    try {
      token = decryptSecret(row.tokenEnc);
    } catch (err) {
      this.logger.error({ err, guildId }, 'Custom bot token decrypt failed');
      return;
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [
        Partials.GuildMember,
        Partials.User,
        Partials.Message,
        Partials.Reaction,
        Partials.Channel,
      ],
    });

    // Music is bound to the main client's Lavalink session, so it's off here.
    const ctx: BotContext = { ...this.base, client, music: null };

    client.on(Events.InteractionCreate, (interaction) => {
      void dispatchInteraction(interaction, ctx, this.commands, this.componentHandlers).catch(
        (err: unknown) => this.logger.error({ err, guildId }, 'Custom bot dispatch error'),
      );
    });
    client.on(Events.Error, (err) => this.logger.error({ err, guildId }, 'Custom bot client error'));
    client.once(Events.ClientReady, (ready) => {
      void this.onReady(ready, row).catch((err: unknown) =>
        this.logger.error({ err, guildId }, 'Custom bot ready handler failed'),
      );
    });

    try {
      await client.login(token);
      this.clients.set(guildId, client);
    } catch (err) {
      this.logger.error({ err, guildId }, 'Custom bot login failed');
      await client.destroy().catch(() => undefined);
    }
  }

  private async onReady(ready: Client<true>, row: CustomBotRow): Promise<void> {
    const { guildId } = row;

    ready.user.setPresence({
      status: STATUS[row.status] ?? 'online',
      activities: row.activityText
        ? [
            {
              name: row.activityText,
              type: ACTIVITY[row.activityType ?? 'PLAYING'] ?? ActivityType.Playing,
              url: row.streamUrl ?? undefined,
            },
          ]
        : [],
    });

    // Identity is best-effort — username changes are rate-limited by Discord.
    if (row.botName && ready.user.username !== row.botName) {
      await ready.user
        .setUsername(row.botName)
        .catch((err: unknown) => this.logger.warn({ err, guildId }, 'Custom bot username set failed'));
    }
    if (row.avatarUrl) await ready.user.setAvatar(row.avatarUrl).catch(() => undefined);
    if (row.bannerUrl) {
      const settable = ready.user as unknown as { setBanner?: (url: string) => Promise<unknown> };
      await settable.setBanner?.(row.bannerUrl).catch(() => undefined);
    }

    // Mirror the command set (minus the owner /admin surface) guild-scoped for
    // instant availability in the one server this bot serves.
    const data = [...this.commands.values()]
      .filter((c) => c.data.name !== 'admin')
      .map((c) => c.data.toJSON());
    const guild = ready.guilds.cache.get(guildId) ?? (await ready.guilds.fetch(guildId).catch(() => null));
    if (guild) {
      await guild.commands
        .set(data)
        .catch((err: unknown) =>
          this.logger.warn({ err, guildId }, 'Custom bot command registration failed'),
        );
    }
    this.logger.info({ guildId, user: ready.user.tag }, 'Custom bot ready');
  }

  async stop(guildId: string): Promise<void> {
    const client = this.clients.get(guildId);
    if (!client) return;
    this.clients.delete(guildId);
    await client.destroy().catch(() => undefined);
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.clients.values()].map((client) => client.destroy()));
    this.clients.clear();
  }
}
