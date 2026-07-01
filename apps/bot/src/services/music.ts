import type { Client, EmbedBuilder } from 'discord.js';
import { LavalinkManager, type Player, type Track, type VoicePacket } from 'lavalink-client';
import { env } from '../env';
import type { Logger } from '../logger';
import type { ConfigCache } from './configCache';
import { clearSkipVotes, nowPlayingEmbed } from '../lib/music';

/**
 * Builds the Lavalink manager for the Music module. Only called when
 * MUSIC_ENABLED is set — otherwise the bot never connects to a node and
 * `ctx.music` stays null. YouTube is disabled on the default Lavalink image, so
 * the default search source is SoundCloud (direct URLs for other sources work).
 */
export function createMusicManager(
  client: Client,
  logger: Logger,
  config: ConfigCache,
): LavalinkManager {
  const manager = new LavalinkManager({
    nodes: [
      {
        id: 'main',
        host: env.LAVALINK_HOST,
        port: env.LAVALINK_PORT,
        authorization: env.LAVALINK_PASSWORD,
        retryAmount: 10,
        retryDelay: 5_000,
      },
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: 'scsearch',
      clientBasedPositionUpdateInterval: 5_000,
      onEmptyQueue: { destroyAfterMs: 300_000 },
    },
  });

  // discord.js emits `raw` for every gateway packet but omits it from
  // ClientEvents' types; Lavalink needs the voice packets forwarded to it.
  (client as unknown as { on(event: 'raw', listener: (packet: VoicePacket) => void): void }).on(
    'raw',
    (packet) => void manager.sendRawData(packet),
  );

  manager.nodeManager
    .on('connect', (node) => logger.info({ node: node.id }, 'Lavalink node connected'))
    .on('disconnect', (node, reason) =>
      logger.warn({ node: node.id, reason }, 'Lavalink node disconnected'),
    )
    .on('error', (node, error) =>
      logger.error({ node: node.id, err: error }, 'Lavalink node error'),
    );

  manager
    .on('trackStart', (player, track) => {
      clearSkipVotes(player.guildId);
      void announceNowPlaying(client, config, logger, player, track);
    })
    .on('queueEnd', (player) => {
      clearSkipVotes(player.guildId);
      void sendToPlayerChannel(client, player, '🏁 Queue finished — leaving soon if nothing is added.');
    })
    .on('playerDestroy', (player) => clearSkipVotes(player.guildId));

  return manager;
}

async function announceNowPlaying(
  client: Client,
  config: ConfigCache,
  logger: Logger,
  player: Player,
  track: Track | null,
): Promise<void> {
  if (!track) return;
  try {
    const cfg = await config.getConfig(player.guildId, 'MUSIC');
    if (!cfg.announceNowPlaying) return;
  } catch (err) {
    logger.debug({ err, guildId: player.guildId }, 'Music config read failed for announce');
    return;
  }
  await sendToPlayerChannel(client, player, { embeds: [nowPlayingEmbed(track, player)] });
}

async function sendToPlayerChannel(
  client: Client,
  player: Player,
  content: string | { embeds: EmbedBuilder[] },
): Promise<void> {
  if (!player.textChannelId) return;
  const channel = client.channels.cache.get(player.textChannelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return;
  const payload = typeof content === 'string' ? { content } : content;
  await channel.send(payload).catch(() => undefined);
}
