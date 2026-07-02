import type { Client, EmbedBuilder } from 'discord.js';
import { LavalinkManager, type Player, type Track, type VoicePacket } from 'lavalink-client';
import { env } from '../env';
import type { Logger } from '../logger';
import type { ConfigCache } from './configCache';
import { clearSkipVotes, findFallbackTrack, nowPlayingEmbed, SOURCE_NAMES } from '../lib/music';

/** Per-guild pending auto-leave timers (ephemeral; tied to the live player). */
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelLeaveTimer(guildId: string): void {
  const timer = leaveTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    leaveTimers.delete(guildId);
  }
}

/**
 * Builds the Lavalink manager for the Music module. Only called when
 * MUSIC_ENABLED is set — otherwise the bot never connects to a node and
 * `ctx.music` stays null. YouTube is served by the youtube-source plugin (see
 * lavalink/application.yml); the fallback search source here is 'ytsearch', but
 * every /play overrides it with the per-guild MusicConfig.searchSource (direct
 * URLs resolve regardless). Auto-leave is driven per-guild by the queueEnd timer
 * below, honouring MusicConfig.autoLeaveSeconds.
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
      // Per-guild source is passed on each /play; this is only the fallback.
      defaultSearchPlatform: 'ytsearch',
      clientBasedPositionUpdateInterval: 5_000,
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
      cancelLeaveTimer(player.guildId); // a new track cancels a pending auto-leave
      clearSkipVotes(player.guildId);
      void announceNowPlaying(client, config, logger, player, track);
    })
    .on('queueEnd', (player) => {
      clearSkipVotes(player.guildId);
      void scheduleAutoLeave(config, logger, player);
    })
    .on('playerDestroy', (player) => {
      cancelLeaveTimer(player.guildId);
      clearSkipVotes(player.guildId);
    })
    // A failing source (e.g. YouTube refusing datacenter IPs) first tries the
    // same song on the other sources; only when nowhere has it do we surface
    // the error. Never silent either way.
    .on('trackError', (player, track, payload) => {
      const reason =
        (payload as { exception?: { message?: string } }).exception?.message ?? 'unknown error';
      logger.warn(
        { guildId: player.guildId, track: track?.info?.title, reason },
        'Music track errored — attempting source fallback',
      );
      void (async () => {
        const replacement = track ? await findFallbackTrack(player, track).catch(() => null) : null;
        if (replacement) {
          // If autoSkip already advanced to the next queued song, slot the
          // replacement in right after it instead of hijacking playback.
          if (player.playing && player.queue.current) {
            await player.queue.add(replacement.track, 0);
          } else {
            await player.play({ clientTrack: replacement.track });
          }
          await sendToPlayerChannel(
            client,
            player,
            `↩️ **${track?.info?.title ?? 'Track'}** failed on its source — playing the ${SOURCE_NAMES[replacement.source]} match instead.`,
          );
          return;
        }
        await sendToPlayerChannel(
          client,
          player,
          `⚠️ Couldn't play **${track?.info?.title ?? 'that track'}** on any source: ${reason}`,
        );
      })();
    })
    .on('trackStuck', (player, track) => {
      logger.warn({ guildId: player.guildId, track: track?.info?.title }, 'Music track stuck');
      void sendToPlayerChannel(
        client,
        player,
        `⚠️ **${track?.info?.title ?? 'That track'}** stalled — skipping.`,
      );
    });

  return manager;
}

/**
 * Queue emptied — leave after the guild's configured delay unless a new track
 * starts first (which cancels the timer). autoLeaveSeconds=0 leaves immediately.
 */
async function scheduleAutoLeave(config: ConfigCache, logger: Logger, player: Player): Promise<void> {
  cancelLeaveTimer(player.guildId);
  let seconds = 300;
  try {
    seconds = (await config.getConfig(player.guildId, 'MUSIC')).autoLeaveSeconds;
  } catch (err) {
    logger.debug({ err, guildId: player.guildId }, 'Music config read failed for auto-leave');
  }
  const timer = setTimeout(() => {
    leaveTimers.delete(player.guildId);
    if (player.playing) return; // a track slipped in — leave it be
    void player.destroy('Auto-leave: queue empty').catch(() => undefined);
  }, seconds * 1000);
  leaveTimers.set(player.guildId, timer);
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
