import { describe, expect, it } from 'vitest';
import { buildTwitchEndedEmbed, buildTwitchLiveEmbed, buildTwitchWatchRow } from './twitchAlert';
import type { TwitchStream } from './social';

const stream: TwitchStream = {
  startedAt: '2026-11-11T20:00:00Z',
  title: 'Cozy frog games',
  userName: 'Nomz',
  userLogin: 'nomz',
  url: 'https://twitch.tv/nomz',
  game: 'Stardew Valley',
  viewers: 1234,
  thumbnailUrl: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_nomz-{width}x{height}.jpg',
  avatarUrl: 'https://example.com/avatar.png',
};
const now = Date.parse('2026-11-11T22:05:00Z');

describe('buildTwitchLiveEmbed', () => {
  it('shows the title, game, viewers, avatar and a sized, cache-busted preview', () => {
    const embed = buildTwitchLiveEmbed(stream, now).toJSON();
    expect(embed.author?.name).toBe('Nomz is live on Twitch');
    expect(embed.author?.icon_url).toBe(stream.avatarUrl);
    expect(embed.title).toBe('Cozy frog games');
    expect(embed.url).toBe('https://twitch.tv/nomz');
    expect(embed.fields).toEqual([
      { name: 'Playing', value: 'Stardew Valley', inline: true },
      { name: 'Viewers', value: '1,234', inline: true },
    ]);
    expect(embed.image?.url).toContain('live_user_nomz-1280x720.jpg?t=');
    expect(embed.thumbnail?.url).toBe(stream.avatarUrl);
  });

  it('copes with a stream that has no game, title, avatar or preview', () => {
    const embed = buildTwitchLiveEmbed(
      { ...stream, game: '', title: '', avatarUrl: null, thumbnailUrl: '' },
      now,
    ).toJSON();
    expect(embed.title).toBe('Live now');
    expect(embed.fields?.[0]?.value).toBe('Just chatting');
    expect(embed.image).toBeUndefined();
    expect(embed.thumbnail).toBeUndefined();
  });
});

describe('buildTwitchEndedEmbed', () => {
  it('turns the live alert into a summary with the duration and no preview', () => {
    const live = buildTwitchLiveEmbed(stream, now).toJSON();
    const ended = buildTwitchEndedEmbed(live, stream.startedAt, now).toJSON();
    expect(ended.author?.name).toBe('Nomz was live on Twitch');
    expect(ended.title).toBe('Cozy frog games');
    expect(ended.fields).toEqual([
      { name: 'Played', value: 'Stardew Valley', inline: true },
      { name: 'Duration', value: '2h 05m', inline: true },
    ]);
    expect(ended.image).toBeUndefined();
    expect(ended.footer?.text).toContain('Stream ended');
  });

  it('omits the duration when the start time is unknown', () => {
    const live = buildTwitchLiveEmbed(stream, now).toJSON();
    const ended = buildTwitchEndedEmbed(live, null, now).toJSON();
    expect(ended.fields?.map((field) => field.name)).toEqual(['Played']);
  });
});

describe('buildTwitchWatchRow', () => {
  it('links to the channel', () => {
    const [button] = buildTwitchWatchRow(stream.url).toJSON().components;
    expect(button).toMatchObject({ label: 'Watch on Twitch', url: stream.url });
  });
});
