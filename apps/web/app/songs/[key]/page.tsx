import { notFound } from 'next/navigation';
import { prisma, verifyTwitchSongKey } from '@refx/database';
import { BRAND } from '@refx/shared';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Song queue', robots: { index: false } };

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The public song queue (what !queue links to). */
export default async function SongQueuePage({ params }: { params: Promise<{ key: string }> }) {
  const guildId = verifyTwitchSongKey((await params).key, 'queue');
  if (!guildId) notFound();
  const [playing, queue] = await Promise.all([
    prisma.twitchSongRequest.findFirst({
      where: { guildId, status: 'playing' },
      orderBy: { playedAt: 'desc' },
    }),
    prisma.twitchSongRequest.findMany({
      where: { guildId, status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
      <meta httpEquiv="refresh" content="20" />
      <h1 className="text-xl font-semibold text-white/90">Song queue</h1>
      <div className="glass rounded-xl p-4">
        <p className="text-xs uppercase tracking-wider text-white/40">Now playing</p>
        {playing ? (
          <p className="mt-1 text-white/90">
            {playing.title} <span className="text-sm text-white/45">· {playing.requestedBy}</span>
          </p>
        ) : (
          <p className="mt-1 text-white/50">Nothing right now.</p>
        )}
      </div>
      <ol className="flex flex-col gap-1.5">
        {queue.length === 0 && (
          <p className="text-white/50">The queue is empty. Request a song with !sr in chat.</p>
        )}
        {queue.map((song, index) => (
          <li
            key={song.id}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <span className="w-6 text-sm text-white/40">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-white/85">{song.title}</span>
            <span className="text-xs text-white/45">
              {clock(song.durationSeconds)} · {song.requestedBy}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-center text-xs text-white/30">{BRAND.name}</p>
    </main>
  );
}
