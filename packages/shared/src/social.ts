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

export const socialSubscriptionInputSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    target: z.string().min(1).max(500),
    channelId: z.string().regex(/^\d{17,20}$/, 'Pick a channel.'),
    mentionRoleId: z
      .string()
      .regex(/^\d{17,20}$/)
      .nullable()
      .default(null),
  })
  .transform((input) => ({ ...input, target: normalizeSocialTarget(input.platform, input.target) }))
  .refine((input) => TARGET_RULES[input.platform](input.target), {
    message: 'That doesn’t look right for this platform.',
    path: ['target'],
  });
export type SocialSubscriptionInput = z.input<typeof socialSubscriptionInputSchema>;
