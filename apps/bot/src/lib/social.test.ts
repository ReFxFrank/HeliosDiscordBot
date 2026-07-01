import { describe, expect, it } from 'vitest';
import { SOCIAL_PLATFORMS, blueskyPostUrl, blueskyTitle, isSocialPlatform } from './social';

describe('bluesky helpers', () => {
  it('builds the web URL from an at-uri and handle', () => {
    expect(blueskyPostUrl('at://did:plc:abc123/app.bsky.feed.post/3k44xyz', 'alice.bsky.social')).toBe(
      'https://bsky.app/profile/alice.bsky.social/post/3k44xyz',
    );
  });

  it('uses the first line of the post text as the title, truncated', () => {
    expect(blueskyTitle('Hello world\nsecond line')).toBe('Hello world');
    expect(blueskyTitle('')).toBe('New post');
    expect(blueskyTitle(undefined)).toBe('New post');
    const long = 'a'.repeat(200);
    const title = blueskyTitle(long);
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith('…')).toBe(true);
  });

  it('registers bluesky as a platform', () => {
    expect(SOCIAL_PLATFORMS).toContain('bluesky');
    expect(isSocialPlatform('bluesky')).toBe(true);
    expect(isSocialPlatform('tiktok')).toBe(false);
  });
});
