import { prisma, verifyTwitchSongKey } from '@refx/database';
import { twitchChatConfigSchema } from '@refx/shared';
import { getRedis } from '../../../../lib/redis';

export const dynamic = 'force-dynamic';

/**
 * The OBS song player's API (the link's secret key is the only auth).
 * GET: what should be playing, the queue length and volume.
 * POST {action: "next"}: start the next queued song (marks it playing).
 * POST {action: "ended"|"error", id}: finish the current song.
 */

async function volume(guildId: string): Promise<number> {
  const stored = await getRedis()
    .get(`twitchsongs:volume:${guildId}`)
    .catch(() => null);
  if (stored !== null) return Number(stored);
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TWITCH_CHAT' } },
    select: { config: true },
  });
  return twitchChatConfigSchema.parse(row?.config ?? {}).songs.volume;
}

async function state(guildId: string) {
  const [playing, queued, vol] = await Promise.all([
    prisma.twitchSongRequest.findFirst({
      where: { guildId, status: 'playing' },
      orderBy: { playedAt: 'desc' },
      select: { id: true, videoId: true, title: true, requestedBy: true, durationSeconds: true },
    }),
    prisma.twitchSongRequest.count({ where: { guildId, status: 'queued' } }),
    volume(guildId),
  ]);
  return { playing, queued, volume: vol };
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const guildId = verifyTwitchSongKey((await params).key, 'player');
  if (!guildId) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(await state(guildId), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const guildId = verifyTwitchSongKey((await params).key, 'player');
  if (!guildId) return Response.json({ error: 'Not found' }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: string };

  if (body.action === 'ended' || body.action === 'error') {
    if (body.id) {
      await prisma.twitchSongRequest.updateMany({
        where: { guildId, id: body.id, status: 'playing' },
        data: { status: body.action === 'ended' ? 'played' : 'skipped' },
      });
    }
  } else if (body.action === 'next') {
    const current = await prisma.twitchSongRequest.findFirst({
      where: { guildId, status: 'playing' },
    });
    if (!current) {
      const next = await prisma.twitchSongRequest.findFirst({
        where: { guildId, status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        // Only one player wins the race for a song.
        await prisma.twitchSongRequest.updateMany({
          where: { id: next.id, status: 'queued' },
          data: { status: 'playing', playedAt: new Date() },
        });
      }
    }
  }
  return Response.json(await state(guildId), { headers: { 'Cache-Control': 'no-store' } });
}
