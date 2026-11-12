import { prisma } from '@refx/database';
import {
  formatBytes,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_PER_GUILD,
  MEDIA_MAX_TOTAL_BYTES_PER_GUILD,
  mediaPath,
  sniffImageType,
} from '@refx/shared';
import { assertCanManage, requireSession } from '../../../../../lib/auth-guards';

export const dynamic = 'force-dynamic';

function fail(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

/** Where uploaded images are served from: the dashboard's public address. */
function publicBase(request: Request): string {
  const configured = process.env.AUTH_URL ?? process.env.DASHBOARD_URL;
  return (configured ?? new URL(request.url).origin).replace(/\/+$/, '');
}

/**
 * Upload an image for this server (multipart form, field `file`). Returns the
 * public URL to put in an image field. Only server managers can upload, the
 * file must really be a PNG, JPEG, GIF or WebP, and each server has a cap.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: guildId } = await params;

  let userId: string;
  try {
    const session = await requireSession();
    await assertCanManage(session, guildId);
    userId = session.user.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'Unauthorized') return fail(401, 'Your session ended. Sign in again.');
    if (message.startsWith('Forbidden')) {
      return fail(403, 'You need Manage Server on this server to upload images.');
    }
    return fail(429, 'Too many changes at once. Wait a moment and try again.');
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    file = value instanceof File ? value : null;
  } catch {
    return fail(400, "That upload couldn't be read. Try choosing the file again.");
  }
  if (!file || file.size === 0) return fail(400, 'Choose an image to upload.');
  if (file.size > MEDIA_MAX_BYTES) {
    return fail(
      413,
      `That image is ${formatBytes(file.size)}. The limit is ${formatBytes(MEDIA_MAX_BYTES)}; save it smaller and try again.`,
    );
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(data);
  if (!type) return fail(415, 'Only PNG, JPEG, GIF and WebP images can be uploaded.');

  const usage = await prisma.mediaAsset.aggregate({
    where: { guildId },
    _count: { _all: true },
    _sum: { byteSize: true },
  });
  if (usage._count._all >= MEDIA_MAX_PER_GUILD) {
    return fail(
      409,
      `This server already has ${MEDIA_MAX_PER_GUILD} uploaded images, the most it can hold.`,
    );
  }
  if ((usage._sum.byteSize ?? 0) + data.length > MEDIA_MAX_TOTAL_BYTES_PER_GUILD) {
    return fail(
      409,
      `This server's uploads would go over ${formatBytes(MEDIA_MAX_TOTAL_BYTES_PER_GUILD)}.`,
    );
  }

  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
  const asset = await prisma.mediaAsset.create({
    data: { guildId, contentType: type, byteSize: data.length, data, uploadedBy: userId },
    select: { id: true },
  });
  return Response.json({
    ok: true,
    url: `${publicBase(request)}${mediaPath(asset.id, type)}`,
  });
}
