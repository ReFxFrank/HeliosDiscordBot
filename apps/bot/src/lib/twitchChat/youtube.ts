/**
 * YouTube lookups for song requests, without an API key: video ids from
 * links, a search through YouTube's results page, and the title/length from
 * the watch page. oEmbed doubles as the "can this be embedded?" check, since
 * the player overlay can only play embeddable videos.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface YouTubeVideo {
  id: string;
  title: string;
  durationSeconds: number;
}

/** The 11-character id from a link or a bare id; null if it isn't one. */
export function youtubeVideoId(input: string): string | null {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return url.pathname.slice(1, 12).match(/^[\w-]{11}$/)?.[0] ?? null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = url.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const path = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      return path?.[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** The first few video results for a search, best first. */
export async function searchYouTube(query: string): Promise<string[]> {
  const html = await getText(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`,
  );
  const ids = [...(html ?? '').matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"/g)]
    .map((m) => m[1])
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)].slice(0, 5);
}

/** Title and length, or null when the video is missing or can't be embedded. */
export async function youtubeVideo(id: string): Promise<YouTubeVideo | null> {
  const oembed = await getText(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
  );
  if (!oembed) return null;
  let title = 'Unknown video';
  try {
    title = (JSON.parse(oembed) as { title?: string }).title ?? title;
  } catch {
    return null;
  }
  const page = await getText(`https://www.youtube.com/watch?v=${id}`);
  const length = Number(page?.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0);
  // No length means a live stream (or a page we couldn't read): not playable.
  if (!length) return null;
  return { id, title, durationSeconds: length };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
