/**
 * TikTok new-video alerts. TikTok has no public feed or keyless API, so this
 * reads the creator embed page (www.tiktok.com/embed/@name), the same page
 * TikTok serves for embedding a profile on other sites. It carries the latest
 * public videos as JSON, newest first, with no login or signing needed.
 *
 * TikTok video ids are time-ordered (the top 32 bits are the upload time in
 * seconds), so "new" is simply "id greater than the last one seen". That
 * also ignores pinned videos and survives the anchor video being deleted.
 */

/** TikTok serves the embed page to browsers; a bot User-Agent gets less. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15_000;
const COVER_MAX_BYTES = 8 * 1024 * 1024;

export interface TikTokVideo {
  id: string;
  /** Caption as written (may be empty). */
  description: string;
  url: string;
  /** Signed CDN link; it expires after a few days, so alerts attach a copy. */
  coverUrl: string | null;
  authorHandle: string;
  authorName: string;
  profileUrl: string;
  avatarUrl: string | null;
}

interface EmbedVideo {
  id?: unknown;
  desc?: unknown;
  coverUrl?: unknown;
  originCoverUrl?: unknown;
  privateItem?: unknown;
  authorUniqueId?: unknown;
}

interface EmbedPage {
  isError?: unknown;
  userInfo?: { uniqueId?: unknown; nickname?: unknown; avatarThumbUrl?: unknown };
  videoList?: unknown;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Newest first. Ids are numeric strings longer than a JS number can hold. */
export function compareTikTokIds(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x === y ? 0 : x > y ? -1 : 1;
}

/** Whether `id` is newer than `anchor` (a non-numeric anchor counts as nothing seen). */
export function isNewerTikTok(id: string, anchor: string): boolean {
  if (!/^\d+$/.test(anchor)) return true;
  return BigInt(id) > BigInt(anchor);
}

/** Upload time encoded in a video id. */
export function tiktokUploadedAt(id: string): Date {
  return new Date(Number(BigInt(id) >> 32n) * 1000);
}

export function tiktokVideoUrl(handle: string, id: string): string {
  return `https://www.tiktok.com/@${handle}/video/${id}`;
}

/**
 * Parse the creator embed page. Returns null when the page isn't what we
 * expect (unknown account, TikTok changed the page, a block page), so the
 * poller can tell "couldn't read" apart from "no videos yet".
 */
export function parseTikTokEmbed(html: string, handle: string): TikTokVideo[] | null {
  const match = html.match(
    /<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) return null;
  let state: { source?: { data?: Record<string, unknown> } };
  try {
    state = JSON.parse(match[1]) as typeof state;
  } catch {
    return null;
  }
  const page = Object.values(state.source?.data ?? {}).find(
    (entry): entry is EmbedPage =>
      typeof entry === 'object' && entry !== null && Array.isArray((entry as EmbedPage).videoList),
  );
  if (!page || page.isError === true || !Array.isArray(page.videoList)) return null;

  const author = str(page.userInfo?.uniqueId) || handle;
  const authorName = str(page.userInfo?.nickname) || author;
  const avatarUrl = str(page.userInfo?.avatarThumbUrl) || null;
  const videos: TikTokVideo[] = [];
  for (const raw of page.videoList as EmbedVideo[]) {
    const id = str(raw?.id);
    if (!/^\d{5,25}$/.test(id) || raw.privateItem === true) continue;
    const videoAuthor = str(raw.authorUniqueId) || author;
    videos.push({
      id,
      description: str(raw.desc).trim(),
      url: tiktokVideoUrl(videoAuthor, id),
      coverUrl: str(raw.originCoverUrl) || str(raw.coverUrl) || null,
      authorHandle: videoAuthor,
      authorName,
      profileUrl: `https://www.tiktok.com/@${author}`,
      avatarUrl,
    });
  }
  return videos.sort((a, b) => compareTikTokIds(a.id, b.id));
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/** Latest public videos, newest first; null when TikTok couldn't be read. */
export async function fetchTikTokVideos(handle: string): Promise<TikTokVideo[] | null> {
  const res = await fetchWithTimeout(`https://www.tiktok.com/embed/@${encodeURIComponent(handle)}`);
  if (!res?.ok) return null;
  try {
    return parseTikTokEmbed(await res.text(), handle);
  } catch {
    return null;
  }
}

/** Download a cover so the alert keeps its picture after TikTok's link expires. */
export async function downloadTikTokCover(
  url: string,
): Promise<{ data: Buffer; extension: string } | null> {
  let host: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    if (parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  // Only TikTok's own CDNs: the URL comes from TikTok's page, not from a user.
  if (!/(^|\.)(tiktokcdn(-us|-eu)?\.com|tiktokcdn\.net|ibyteimg\.com|byteimg\.com)$/.test(host)) {
    return null;
  }
  const res = await fetchWithTimeout(url);
  if (!res?.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  const extension = type.includes('png')
    ? 'png'
    : type.includes('webp')
      ? 'webp'
      : type.includes('jpeg') || type.includes('jpg')
        ? 'jpg'
        : null;
  if (!extension) return null;
  try {
    const data = Buffer.from(await res.arrayBuffer());
    return data.length > 0 && data.length <= COVER_MAX_BYTES ? { data, extension } : null;
  } catch {
    return null;
  }
}
