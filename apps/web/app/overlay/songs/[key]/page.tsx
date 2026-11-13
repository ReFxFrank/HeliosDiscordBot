import { notFound } from 'next/navigation';
import { verifyTwitchSongKey } from '@refx/database';
import { SongPlayer } from './player';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Song player', robots: { index: false } };

/** The OBS browser source that plays the song request queue. */
export default async function SongPlayerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!verifyTwitchSongKey(key, 'player')) notFound();
  return (
    <>
      {/* OBS shows the page's background; keep it see-through. */}
      <style>{'html,body{background:transparent!important;background-image:none!important}'}</style>
      <SongPlayer apiKey={key} />
    </>
  );
}
