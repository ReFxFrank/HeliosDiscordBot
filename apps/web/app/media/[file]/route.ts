import { prisma } from '@refx/database';
import { parseMediaFileName } from '@refx/shared';

export const dynamic = 'force-dynamic';

/**
 * Serve an uploaded image. Public on purpose: Discord has to fetch it to show
 * it in a message. The id is unguessable, the stored type was checked from the
 * file's bytes at upload, and the file never changes, so it can be cached for
 * good.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const id = parseMediaFileName(file);
  if (!id) return new Response('Not found', { status: 404 });

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { contentType: true, data: true },
  });
  if (!asset) return new Response('Not found', { status: 404 });

  return new Response(asset.data, {
    headers: {
      'Content-Type': asset.contentType,
      'Content-Length': String(asset.data.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${file}"`,
    },
  });
}
