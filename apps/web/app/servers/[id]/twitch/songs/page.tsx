import { prisma, twitchSongKey } from '@refx/database';
import { headers } from 'next/headers';
import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { getRedis } from '../../../../../lib/redis';
import { SongsEditor, type SongItem } from '../../../../../components/twitch/songs-editor';
import { PageHeader } from '../../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

export default async function TwitchSongsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config } = await loadTwitchPage(id);
  const [playing, queue, storedVolume] = await Promise.all([
    prisma.twitchSongRequest.findFirst({
      where: { guildId: id, status: 'playing' },
      orderBy: { playedAt: 'desc' },
    }),
    prisma.twitchSongRequest.findMany({
      where: { guildId: id, status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
    getRedis()
      .get(`twitchsongs:volume:${id}`)
      .catch(() => null),
  ]);
  const host = (await headers()).get('host') ?? '';
  const base = (process.env.AUTH_URL ?? `https://${host}`).replace(/\/+$/, '');
  const pick = (s: {
    id: string;
    title: string;
    videoId: string;
    durationSeconds: number;
    requestedBy: string;
  }): SongItem => ({
    id: s.id,
    title: s.title,
    videoId: s.videoId,
    durationSeconds: s.durationSeconds,
    requestedBy: s.requestedBy,
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Song Requests">
        Chat requests YouTube songs with !sr (link or search). !song shows what’s playing, !queue
        links the queue, !wrongsong removes your last request, !voteskip votes to skip; mods have
        !skip, !volume and !clearqueue.
      </PageHeader>
      <SongsEditor
        guildId={id}
        config={config}
        playing={playing ? pick(playing) : null}
        queue={queue.map(pick)}
        volume={Number(storedVolume ?? config.songs.volume)}
        playerUrl={`${base}/overlay/songs/${twitchSongKey(id, 'player')}`}
        queueUrl={`${base}/songs/${twitchSongKey(id, 'queue')}`}
      />
    </div>
  );
}
