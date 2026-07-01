/**
 * Social Alerts fetchers. YouTube (via its public RSS feed), Reddit (public
 * JSON), and generic RSS/Atom need no API keys; Twitch needs an app token from
 * TWITCH_CLIENT_ID/SECRET. Each fetcher returns items newest-first; the poller
 * dedups against the stored lastItemId.
 */
export const SOCIAL_PLATFORMS = ['twitch', 'youtube', 'reddit', 'rss'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface SocialItem {
  id: string;
  title: string;
  url: string;
  author?: string;
}

interface TwitchEnv {
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
}

const USER_AGENT = 'SolariBot/1.0 (+https://solari.gg)';
const MAX_ITEMS = 15;

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/** Twitch is the only platform that needs credentials. */
export function platformAvailable(platform: SocialPlatform, env: TwitchEnv): boolean {
  return platform !== 'twitch' || Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  const text = await fetchText(url, headers);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── RSS / Atom (regex-parsed — no XML dependency) ───────────────────────────

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function firstTag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  const inner = match?.[1];
  if (inner === undefined) return null;
  const decoded = decodeEntities(inner);
  // Treat an empty/whitespace tag as missing so `??` fallbacks kick in.
  return decoded === '' ? null : decoded;
}

/** Atom entries have multiple <link> tags; prefer the human page (rel="alternate"). */
function atomLink(block: string): string {
  const links = [...block.matchAll(/<link\b([^>]*)>/gi)].map((m) => m[1] ?? '');
  const href = (attrs: string): string | undefined => attrs.match(/href="([^"]+)"/i)?.[1];
  const alternate = links.find((a) => /rel="alternate"/i.test(a));
  const noRel = links.find((a) => !/\brel=/i.test(a));
  for (const candidate of [alternate, noRel, ...links]) {
    if (candidate !== undefined) {
      const url = href(candidate);
      if (url) return url;
    }
  }
  return '';
}

/**
 * Guard against SSRF: only allow http(s) to public hosts. Blocks loopback,
 * RFC1918, link-local (incl. the 169.254.169.254 cloud-metadata endpoint), and
 * IPv6 ULA/loopback. (A hostname that later resolves to a private IP — DNS
 * rebinding — is a residual risk noted for the RSS platform.)
 */
export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
  const b = host.match(/^172\.(\d{1,3})\./);
  if (b && Number(b[1]) >= 16 && Number(b[1]) <= 31) return false;
  if (host === '::1' || /^(fc|fd|fe80)/.test(host)) return false;
  return true;
}

function parseFeed(xml: string): SocialItem[] {
  const items: SocialItem[] = [];

  // Atom (<entry>) — used by YouTube and many blogs.
  const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  for (let m = entryRe.exec(xml); m && items.length < MAX_ITEMS; m = entryRe.exec(xml)) {
    const block = m[1];
    if (!block) continue;
    const id = firstTag(block, 'yt:videoId') ?? firstTag(block, 'id');
    if (!id) continue;
    items.push({
      id,
      title: firstTag(block, 'title') ?? 'New post',
      url: atomLink(block) || (firstTag(block, 'link') ?? ''),
      author: firstTag(block, 'name') ?? undefined,
    });
  }
  if (items.length > 0) return items;

  // RSS (<item>).
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  for (let m = itemRe.exec(xml); m && items.length < MAX_ITEMS; m = itemRe.exec(xml)) {
    const block = m[1];
    if (!block) continue;
    const id = firstTag(block, 'guid') ?? firstTag(block, 'link');
    if (!id) continue;
    items.push({
      id,
      title: firstTag(block, 'title') ?? 'New post',
      url: firstTag(block, 'link') ?? '',
    });
  }
  return items;
}

async function fetchRss(feedUrl: string): Promise<SocialItem[]> {
  if (!isSafePublicUrl(feedUrl)) return []; // defence-in-depth (also validated on /social add)
  const xml = await fetchText(feedUrl);
  return xml === null ? [] : parseFeed(xml);
}

async function fetchYouTube(channelId: string): Promise<SocialItem[]> {
  return fetchRss(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
  );
}

interface RedditListing {
  data?: { children?: { data?: { id: string; title: string; permalink: string } }[] };
}

async function fetchReddit(subreddit: string): Promise<SocialItem[]> {
  const clean = subreddit.replace(/^\/?(r\/)?/i, '');
  const listing = await fetchJson<RedditListing>(
    `https://www.reddit.com/r/${encodeURIComponent(clean)}/new.json?limit=10`,
  );
  const children = listing?.data?.children ?? [];
  return children.flatMap((child) =>
    child.data
      ? [
          {
            id: child.data.id,
            title: child.data.title,
            url: `https://www.reddit.com${child.data.permalink}`,
          },
        ]
      : [],
  );
}

// ── Twitch (app token → live check) ─────────────────────────────────────────

let twitchToken: { token: string; expiresAt: number } | null = null;

async function twitchAppToken(env: TwitchEnv): Promise<string | null> {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return null;
  if (twitchToken && twitchToken.expiresAt > Date.now() + 60_000) return twitchToken.token;
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${env.TWITCH_CLIENT_ID}&client_secret=${env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token: string; expires_in: number };
    twitchToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  } catch {
    return null;
  }
}

interface TwitchStreams {
  data?: { id: string; title: string; user_name: string; user_login: string; started_at: string }[];
}

async function fetchTwitch(login: string, env: TwitchEnv): Promise<SocialItem[]> {
  const token = await twitchAppToken(env);
  if (!token || !env.TWITCH_CLIENT_ID) return [];
  const streams = await fetchJson<TwitchStreams>(
    `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`,
    { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  );
  const stream = streams?.data?.[0];
  if (!stream) return []; // offline — the poller keeps lastItemId so it re-posts next go-live
  return [
    {
      // started_at is stable for a continuous broadcast (unlike stream.id, which
      // can rotate mid-stream), so a new value == a genuine new go-live.
      id: stream.started_at || stream.id,
      title: `${stream.user_name} is live — ${stream.title}`,
      url: `https://twitch.tv/${stream.user_login}`,
      author: stream.user_name,
    },
  ];
}

/** Fetch the latest items for a subscription, newest-first. Never throws. */
export async function fetchLatest(
  platform: SocialPlatform,
  target: string,
  env: TwitchEnv,
): Promise<SocialItem[]> {
  switch (platform) {
    case 'youtube':
      return fetchYouTube(target);
    case 'reddit':
      return fetchReddit(target);
    case 'rss':
      return fetchRss(target);
    case 'twitch':
      return fetchTwitch(target, env);
    default:
      return [];
  }
}
