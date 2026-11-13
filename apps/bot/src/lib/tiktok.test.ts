import { describe, expect, it } from 'vitest';
import {
  compareTikTokIds,
  isNewerTikTok,
  parseTikTokEmbed,
  tiktokUploadedAt,
  tiktokVideoUrl,
} from './tiktok';
import { buildTikTokVideoEmbed, splitTikTokCaption } from './tiktokAlert';

/** A trimmed copy of the creator embed page's state script. */
function embedPage(videoList: unknown[], extra: Record<string, unknown> = {}): string {
  const state = {
    source: {
      data: {
        '/embed/@froggo': {
          isReady: true,
          isError: false,
          userInfo: {
            uniqueId: 'froggo',
            nickname: 'Sleepy Froggo',
            avatarThumbUrl: 'https://p16-sign.tiktokcdn-us.com/avatar.webp',
          },
          videoList,
          ...extra,
        },
        strategy: { page_context: {} },
      },
    },
  };
  return `<html><script id="__FRONTITY_CONNECT_STATE__" type="application/json">${JSON.stringify(state)}</script></html>`;
}

const pinnedOld = { id: '7600000000000000000', desc: 'pinned', authorUniqueId: 'froggo' };
const newest = {
  id: '7707063215498399006',
  desc: 'first line\nsecond line',
  originCoverUrl: 'https://p19-common-sign.tiktokcdn-us.com/cover.image',
  authorUniqueId: 'froggo',
};
const middle = { id: '7704834703446117662', desc: '', authorUniqueId: 'froggo' };

describe('parseTikTokEmbed', () => {
  it('reads videos newest first with the account details', () => {
    const videos = parseTikTokEmbed(embedPage([pinnedOld, middle, newest]), 'froggo');
    expect(videos?.map((v) => v.id)).toEqual([newest.id, middle.id, pinnedOld.id]);
    expect(videos?.[0]).toMatchObject({
      url: 'https://www.tiktok.com/@froggo/video/7707063215498399006',
      coverUrl: newest.originCoverUrl,
      authorName: 'Sleepy Froggo',
      profileUrl: 'https://www.tiktok.com/@froggo',
      description: 'first line\nsecond line',
    });
  });

  it('tells "no videos yet" apart from "could not read"', () => {
    expect(parseTikTokEmbed(embedPage([]), 'froggo')).toEqual([]);
    expect(parseTikTokEmbed('<html>blocked</html>', 'froggo')).toBeNull();
    expect(parseTikTokEmbed(embedPage([newest], { isError: true }), 'froggo')).toBeNull();
    expect(
      parseTikTokEmbed('<script id="__FRONTITY_CONNECT_STATE__">{oops</script>', 'froggo'),
    ).toBeNull();
  });

  it('skips private and malformed items', () => {
    const videos = parseTikTokEmbed(
      embedPage([{ ...middle, privateItem: true }, { id: 'nope' }, newest]),
      'froggo',
    );
    expect(videos?.map((v) => v.id)).toEqual([newest.id]);
  });
});

describe('TikTok ids', () => {
  it('orders and compares ids beyond Number precision', () => {
    expect(compareTikTokIds('7707063215498399006', '7707063215498399005')).toBe(-1);
    expect(isNewerTikTok('7707063215498399006', '7707063215498399005')).toBe(true);
    expect(isNewerTikTok('7707063215498399005', '7707063215498399006')).toBe(false);
    expect(isNewerTikTok('7707063215498399006', '0')).toBe(true);
  });

  it('reads the upload time from the id', () => {
    // 7707063215498399006 >> 32 = 1794440489 seconds.
    expect(tiktokUploadedAt('7707063215498399006').getTime()).toBe(1794440489 * 1000);
    expect(tiktokVideoUrl('froggo', '1')).toBe('https://www.tiktok.com/@froggo/video/1');
  });
});

describe('TikTok alert embed', () => {
  it('uses the first caption line as the title', () => {
    expect(splitTikTokCaption('hello\nworld\n#frog')).toEqual({
      title: 'hello',
      body: 'world\n#frog',
    });
    expect(splitTikTokCaption('   ')).toEqual({ title: 'New TikTok', body: '' });
    const long = splitTikTokCaption('x'.repeat(300));
    expect(long.title).toHaveLength(256);
    expect(long.body).toHaveLength(45);
  });

  it('shows the attached cover, or falls back to the link', () => {
    const [video] = parseTikTokEmbed(embedPage([newest]), 'froggo') ?? [];
    if (!video) throw new Error('no video');
    const attached = buildTikTokVideoEmbed(video, 'tiktok-1.jpg').toJSON();
    expect(attached.image?.url).toBe('attachment://tiktok-1.jpg');
    expect(attached.title).toBe('first line');
    expect(attached.description).toBe('second line');
    expect(attached.url).toBe(video.url);
    expect(attached.author?.name).toBe('Sleepy Froggo posted on TikTok');
    expect(buildTikTokVideoEmbed(video, null).toJSON().image?.url).toBe(newest.originCoverUrl);
  });
});
