import { describe, expect, it } from 'vitest';
import {
  formatStreamDuration,
  isPublicHttpUrl,
  normalizeSocialTarget,
  renderSocialMessage,
  socialSubscriptionInputSchema,
  twitchPreviewUrl,
} from './social';

const base = { channelId: '123456789012345678' };

describe('alert message + Twitch helpers', () => {
  const vars = {
    streamer: 'Nomz',
    title: 'Cozy frog games',
    game: 'Stardew Valley',
    url: 'https://twitch.tv/nomz',
    role: '<@&111111111111111111>',
  };

  it('fills placeholders and leaves unknown tokens alone', () => {
    expect(
      renderSocialMessage('{role} {streamer} is live playing {game}! {url} {nope}', vars),
    ).toBe(
      '<@&111111111111111111> Nomz is live playing Stardew Valley! https://twitch.tv/nomz {nope}',
    );
  });

  it('trims the gap left by an empty role', () => {
    expect(renderSocialMessage('{role} {title}', { ...vars, role: '' })).toBe('Cozy frog games');
  });

  it('sizes and cache-busts the preview', () => {
    expect(twitchPreviewUrl('https://x/live-{width}x{height}.jpg', 42)).toBe(
      'https://x/live-1280x720.jpg?t=42',
    );
    expect(twitchPreviewUrl('', 42)).toBe('');
  });

  it('formats stream length', () => {
    expect(formatStreamDuration(47 * 60_000)).toBe('47m');
    expect(formatStreamDuration(125 * 60_000)).toBe('2h 05m');
  });

  it('requires the live role and streamer together, and only for Twitch', () => {
    const ok = (extra: object) =>
      socialSubscriptionInputSchema.safeParse({
        ...base,
        platform: 'twitch',
        target: 'nomz',
        ...extra,
      }).success;
    expect(ok({})).toBe(true);
    expect(ok({ liveRoleId: '222222222222222222', liveUserId: '333333333333333333' })).toBe(true);
    expect(ok({ liveRoleId: '222222222222222222' })).toBe(false);
    expect(
      socialSubscriptionInputSchema.safeParse({
        ...base,
        platform: 'reddit',
        target: 'frogs',
        liveRoleId: '222222222222222222',
        liveUserId: '333333333333333333',
      }).success,
    ).toBe(false);
  });

  it('stores a blank custom message as null', () => {
    const parsed = socialSubscriptionInputSchema.parse({
      ...base,
      platform: 'twitch',
      target: 'nomz',
      message: '   ',
    });
    expect(parsed.message).toBeNull();
  });
});

describe('socialSubscriptionInputSchema', () => {
  it('normalizes a pasted Twitch URL to the login', () => {
    const parsed = socialSubscriptionInputSchema.parse({
      ...base,
      platform: 'twitch',
      target: 'https://www.twitch.tv/RibbitRetreat/videos',
    });
    expect(parsed.target).toBe('ribbitretreat');
    expect(parsed.mentionRoleId).toBeNull();
  });

  it('rejects targets that do not fit the platform', () => {
    const bad = (platform: string, target: string) =>
      socialSubscriptionInputSchema.safeParse({ ...base, platform, target }).success;
    expect(bad('twitch', 'has spaces')).toBe(false);
    expect(bad('youtube', 'not-a-channel-id')).toBe(false);
    expect(bad('rss', 'http://localhost/feed')).toBe(false);
    expect(bad('rss', 'https://example.com/feed.xml')).toBe(true);
  });

  it('strips r/ and @ prefixes', () => {
    expect(normalizeSocialTarget('reddit', 'r/frogs')).toBe('frogs');
    expect(normalizeSocialTarget('bluesky', '@name.bsky.social')).toBe('name.bsky.social');
  });
});

describe('isPublicHttpUrl', () => {
  it('blocks private and non-http targets', () => {
    for (const url of [
      'ftp://example.com/x',
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://172.20.1.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest',
      'http://[::1]/',
      'nonsense',
    ]) {
      expect(isPublicHttpUrl(url)).toBe(false);
    }
    expect(isPublicHttpUrl('https://example.com/feed')).toBe(true);
  });
});
