import { z } from 'zod';

/**
 * Social Alerts contracts shared by the dashboard form, its server action and
 * the bot. Mirrors the `/social add` command: a subscription watches one source
 * and posts new items (a stream going live, a new video or post) to a channel.
 */

export const SOCIAL_PLATFORMS = ['twitch', 'youtube', 'reddit', 'bluesky', 'rss'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  twitch: 'Twitch (goes live)',
  youtube: 'YouTube (new videos)',
  reddit: 'Reddit (new posts)',
  bluesky: 'Bluesky (new posts)',
  rss: 'RSS / Atom feed',
};

/** What to type as the target for each platform. */
export const SOCIAL_TARGET_HINTS: Record<SocialPlatform, string> = {
  twitch: 'Twitch username, e.g. ribbitretreat',
  youtube: 'YouTube channel id (starts with UC…)',
  reddit: 'Subreddit name, without r/',
  bluesky: 'Bluesky handle, e.g. name.bsky.social',
  rss: 'Public feed URL (https://…)',
};

/** Same per-server cap as `/social add`. */
export const SOCIAL_MAX_PER_GUILD = 25;

/**
 * SSRF guard for feed URLs: only http(s) to public hosts. Blocks loopback,
 * RFC1918, link-local (incl. the cloud-metadata address) and IPv6 ULA/loopback.
 */
export function isPublicHttpUrl(raw: string): boolean {
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

const TARGET_RULES: Record<SocialPlatform, (target: string) => boolean> = {
  twitch: (t) => /^[a-zA-Z0-9_]{3,25}$/.test(t),
  youtube: (t) => /^UC[\w-]{20,24}$/.test(t),
  reddit: (t) => /^[A-Za-z0-9_]{2,21}$/.test(t),
  bluesky: (t) => /^[a-zA-Z0-9.-]{3,253}$/.test(t) && t.includes('.'),
  rss: isPublicHttpUrl,
};

/** Strip the decorations people paste: "@name", "r/sub", a twitch.tv URL. */
export function normalizeSocialTarget(platform: SocialPlatform, raw: string): string {
  const value = raw.trim();
  if (platform === 'rss') return value;
  if (platform === 'twitch') {
    return value
      .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
      .replace(/^@/, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
  }
  if (platform === 'reddit') return value.replace(/^\/?r\//i, '');
  return value.replace(/^@/, '');
}

const snowflake = z.string().regex(/^\d{17,20}$/);

/** Longest custom alert text (it is sent as the message above the embed). */
export const SOCIAL_MESSAGE_MAX = 500;

/** Placeholders a custom alert message can use. */
export const SOCIAL_MESSAGE_PLACEHOLDERS = [
  '{streamer}',
  '{title}',
  '{game}',
  '{url}',
  '{role}',
] as const;

export interface SocialMessageVars {
  /** Channel / author name. */
  streamer: string;
  title: string;
  /** Twitch category; empty for other platforms. */
  game: string;
  url: string;
  /** The ping role as a mention, or '' when none is set. */
  role: string;
}

/**
 * Fill a custom alert message. Unknown `{tokens}` are left as typed; the result
 * is trimmed and capped at Discord's message limit.
 */
export function renderSocialMessage(template: string, vars: SocialMessageVars): string {
  const values: Record<string, string> = {
    '{streamer}': vars.streamer,
    '{title}': vars.title,
    '{game}': vars.game,
    '{url}': vars.url,
    '{role}': vars.role,
  };
  return template
    .replace(/\{[a-z]+\}/g, (token) => values[token] ?? token)
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .slice(0, 2000);
}

/**
 * A Twitch stream preview at 1280x720. Twitch serves the same URL for a whole
 * broadcast and Discord caches images by URL, so `bust` (e.g. a timestamp)
 * forces a fresh frame each time the alert is updated.
 */
export function twitchPreviewUrl(template: string, bust: number | string): string {
  if (!template) return '';
  const url = template.replace('{width}', '1280').replace('{height}', '720');
  return `${url}${url.includes('?') ? '&' : '?'}t=${bust}`;
}

/** "2h 05m" / "47m" for a stream's length. */
export function formatStreamDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}

export const socialSubscriptionInputSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    target: z.string().min(1).max(500),
    channelId: z.string().regex(/^\d{17,20}$/, 'Pick a channel.'),
    mentionRoleId: snowflake.nullable().default(null),
    /** Custom text sent with the alert; null uses the plain role ping. */
    message: z
      .string()
      .max(SOCIAL_MESSAGE_MAX)
      .nullable()
      .default(null)
      .transform((value) => value?.trim() || null),
    /** Twitch only: role held by `liveUserId` while the stream is live. */
    liveRoleId: snowflake.nullable().default(null),
    liveUserId: snowflake.nullable().default(null),
  })
  .transform((input) => ({ ...input, target: normalizeSocialTarget(input.platform, input.target) }))
  .refine((input) => TARGET_RULES[input.platform](input.target), {
    message: 'That doesn’t look right for this platform.',
    path: ['target'],
  })
  .refine((input) => Boolean(input.liveRoleId) === Boolean(input.liveUserId), {
    message: 'Set both the live role and the streamer, or neither.',
    path: ['liveRoleId'],
  })
  .refine((input) => input.platform === 'twitch' || !input.liveRoleId, {
    message: 'The live role only works for Twitch alerts.',
    path: ['liveRoleId'],
  });
export type SocialSubscriptionInput = z.input<typeof socialSubscriptionInputSchema>;
