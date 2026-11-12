import { describe, expect, it } from 'vitest';
import { isPublicHttpUrl, normalizeSocialTarget, socialSubscriptionInputSchema } from './social';

const base = { channelId: '123456789012345678' };

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
