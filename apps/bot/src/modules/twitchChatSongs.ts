import { prisma, twitchSongKey } from '@refx/database';
import { twitchCanUse } from '@refx/shared';
import {
  formatClock,
  searchYouTube,
  youtubeVideo,
  youtubeVideoId,
} from '../lib/twitchChat/youtube';
import { redis } from '../services/redis';
import type { ChannelState, ChatRuntime, Chatter } from './twitchChatRuntime';

/**
 * Song requests (!sr and friends). The queue lives in TwitchSongRequest; the
 * dashboard's OBS player page plays it, marking songs playing/played. Skips
 * from chat just change a row's status and the player moves on.
 */

export const songVolumeKey = (guildId: string) => `twitchsongs:volume:${guildId}`;

async function current(guildId: string) {
  return prisma.twitchSongRequest.findFirst({
    where: { guildId, status: 'playing' },
    orderBy: { playedAt: 'desc' },
  });
}

export async function handleSongCommand(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  key: 'song' | 'sr' | 'queue' | 'wrongsong' | 'voteskip' | 'skip' | 'volume' | 'clearqueue',
  args: string[],
): Promise<void> {
  const songs = state.config.songs;
  const say = (message: string) => rt.respond(state, chatter, message, 'mention');
  if (!songs.enabled) {
    if (key === 'sr') await say('Song requests are turned off.');
    return;
  }
  const guildId = state.guildId;

  switch (key) {
    case 'sr': {
      if (!twitchCanUse(chatter.level, songs.permission)) return;
      if (songs.liveOnly && !state.live) {
        await say('Song requests only work while the stream is live.');
        return;
      }
      const query = args.join(' ').trim();
      if (!query) {
        await say('Usage: !sr <YouTube link or search>');
        return;
      }
      const linked = youtubeVideoId(query);
      let video = linked ? await youtubeVideo(linked) : null;
      if (!linked) {
        if (!songs.allowSearch) {
          await say('Send a YouTube link.');
          return;
        }
        // Skip live streams and unembeddable results.
        for (const candidate of await searchYouTube(query)) {
          video = await youtubeVideo(candidate);
          if (video) break;
        }
      }
      if (!video) {
        await say(
          linked
            ? 'That video can’t be played here (missing, live or not embeddable).'
            : 'I couldn’t find a playable song for that.',
        );
        return;
      }
      if (video.durationSeconds > songs.maxDurationSeconds) {
        await say(`That song is too long (max ${formatClock(songs.maxDurationSeconds)}).`);
        return;
      }
      const [queued, mine, duplicate] = await Promise.all([
        prisma.twitchSongRequest.count({ where: { guildId, status: 'queued' } }),
        prisma.twitchSongRequest.count({
          where: { guildId, status: 'queued', requestedById: chatter.id },
        }),
        prisma.twitchSongRequest.findFirst({
          where: { guildId, videoId: video.id, status: { in: ['queued', 'playing'] } },
        }),
      ]);
      if (duplicate) {
        await say('That song is already in the queue.');
        return;
      }
      if (queued >= songs.maxQueue) {
        await say('The song queue is full.');
        return;
      }
      if (mine >= songs.maxPerUser && chatter.level !== 'broadcaster') {
        await say(`You already have ${mine} songs in the queue.`);
        return;
      }
      await prisma.twitchSongRequest.create({
        data: {
          guildId,
          videoId: video.id,
          title: video.title.slice(0, 200),
          durationSeconds: video.durationSeconds,
          requestedBy: chatter.name,
          requestedById: chatter.id,
        },
      });
      await say(
        `Added “${video.title}” (${formatClock(video.durationSeconds)}) at #${queued + 1}.`,
      );
      return;
    }
    case 'song': {
      const playing = await current(guildId);
      await say(
        playing
          ? `Now playing: ${playing.title} (requested by ${playing.requestedBy}) https://youtu.be/${playing.videoId}`
          : 'Nothing is playing.',
      );
      return;
    }
    case 'queue': {
      const url = rt.dashboardUrl(`/songs/${twitchSongKey(guildId, 'queue')}`);
      const count = await prisma.twitchSongRequest.count({ where: { guildId, status: 'queued' } });
      await say(`${count} song${count === 1 ? '' : 's'} in the queue${url ? `: ${url}` : '.'}`);
      return;
    }
    case 'wrongsong': {
      const latest = await prisma.twitchSongRequest.findFirst({
        where: { guildId, status: 'queued', requestedById: chatter.id },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) {
        await say('You have no songs in the queue.');
        return;
      }
      await prisma.twitchSongRequest.update({
        where: { id: latest.id },
        data: { status: 'removed' },
      });
      await say(`Removed “${latest.title}”.`);
      return;
    }
    case 'voteskip': {
      const playing = await current(guildId);
      if (!playing) return;
      if (state.voteskip?.songId !== playing.id)
        state.voteskip = { songId: playing.id, voters: new Set() };
      state.voteskip.voters.add(chatter.id);
      const votes = state.voteskip.voters.size;
      if (votes >= songs.voteSkipVotes) {
        await prisma.twitchSongRequest.update({
          where: { id: playing.id },
          data: { status: 'skipped' },
        });
        state.voteskip = null;
        await rt.say(state, `Chat voted to skip “${playing.title}”.`);
      } else {
        await say(`Vote counted (${votes}/${songs.voteSkipVotes}).`);
      }
      return;
    }
    case 'skip': {
      const playing = await current(guildId);
      if (!playing) {
        await say('Nothing is playing.');
        return;
      }
      await prisma.twitchSongRequest.update({
        where: { id: playing.id },
        data: { status: 'skipped' },
      });
      await say(`Skipped “${playing.title}”.`);
      return;
    }
    case 'volume': {
      const value = args[0];
      if (value === undefined) {
        const now = Number((await redis.get(songVolumeKey(guildId))) ?? songs.volume);
        await say(`Volume is ${now}.`);
        return;
      }
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        await say('Volume goes from 0 to 100.');
        return;
      }
      await redis.set(songVolumeKey(guildId), String(n));
      await say(`Volume set to ${n}.`);
      return;
    }
    case 'clearqueue': {
      const res = await prisma.twitchSongRequest.updateMany({
        where: { guildId, status: 'queued' },
        data: { status: 'removed' },
      });
      await say(`Cleared ${res.count} song${res.count === 1 ? '' : 's'} from the queue.`);
    }
  }
}
