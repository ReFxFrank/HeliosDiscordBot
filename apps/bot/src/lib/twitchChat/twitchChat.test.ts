import { describe, expect, it } from 'vitest';
import { twitchChatConfigSchema } from '@refx/shared';
import { calculate } from './external';
import {
  RepeatTracker,
  capsPercent,
  checkFilters,
  compileBlockedTerms,
  estimateLines,
  fancyPercent,
  findBlockedTerm,
  findLinkHosts,
  hasZalgo,
  hostAllowed,
  longestWord,
  maxWordRepeats,
  mentionCount,
  symbolStats,
} from './filters';
import { compileKeywords, compilePhrase, keywordMatches } from './keywords';
import { ChatHistory, parseDuration, parseNuke } from './nuke';
import { formatFollowAge, formatSpan, formatUptime, renderTwitchTemplate } from './variables';
import { youtubeVideoId } from './youtube';

const ctx = {
  user: 'Froggo',
  args: ['@Nomz', 'two', 'three'],
  channel: 'thesleepyfroggo',
  random: () => 0.5,
  now: () => new Date('2026-11-13T12:00:00Z'),
};

describe('renderTwitchTemplate', () => {
  it('fills user, touser, args, ranges and channel', async () => {
    expect(await renderTwitchTemplate('hi $(user) -> $(touser) in $(channel)', ctx)).toBe(
      'hi Froggo -> Nomz in thesleepyfroggo',
    );
    expect(await renderTwitchTemplate('[$(query)] $(2) $(9)', ctx)).toBe('[@Nomz two three] two');
    expect(await renderTwitchTemplate('$(2:) | $(1:2)', ctx)).toBe('two three | @Nomz two');
    expect(await renderTwitchTemplate('$(touser)', { ...ctx, args: [] })).toBe('Froggo');
  });

  it('handles random, pick, math, repeat and encoding', async () => {
    expect(await renderTwitchTemplate('$(random 1-10)', ctx)).toBe('6');
    expect(await renderTwitchTemplate('$(pick red, green, blue)', ctx)).toBe('green');
    expect(await renderTwitchTemplate('$(math 2*(3+4))', ctx)).toBe('14');
    expect(await renderTwitchTemplate('$(repeat 3 hi)', ctx)).toBe('hi hi hi');
    expect(await renderTwitchTemplate('$(urlencode a b&c)', ctx)).toBe('a%20b%26c');
  });

  it('renders nested variables inside out', async () => {
    expect(await renderTwitchTemplate('$(urlencode $(query))', ctx)).toBe('%40Nomz%20two%20three');
    expect(await renderTwitchTemplate('$(math $(random 1-10)*2)', ctx)).toBe('12');
  });

  it('counts down and up to dates', async () => {
    expect(await renderTwitchTemplate('$(countdown 2026-11-15)', ctx)).toBe('1 day, 12 hours');
    expect(await renderTwitchTemplate('$(countup 2026-11-13)', ctx)).toBe('12 hours');
  });

  it('asks the service only for what the text uses, and leaves unknowns', async () => {
    const asked: string[] = [];
    const service = {
      ...ctx,
      extra: { months: 7 },
      lookup: async (name: string, arg: string) => {
        asked.push(`${name}:${arg}`);
        return name === 'uptime' ? '1h 02m' : name === 'count' ? '5' : null;
      },
    };
    expect(
      await renderTwitchTemplate('live $(uptime), used $(count) times, $(months) months', service),
    ).toBe('live 1h 02m, used 5 times, 7 months');
    expect(asked).toEqual(['uptime:', 'count:']);
    expect(await renderTwitchTemplate('$(nope) stays', service)).toBe('$(nope) stays');
  });

  it('caps at 500 characters', async () => {
    expect((await renderTwitchTemplate('x'.repeat(600), ctx)).length).toBe(500);
  });
});

describe('formatting & math', () => {
  it('formats durations', () => {
    expect(formatUptime(45_000)).toBe('45s');
    expect(formatUptime(3 * 3_600_000 + 5 * 60_000)).toBe('3h 05m');
    expect(formatSpan(90_061_000)).toBe('1 day, 1 hour');
    const now = new Date('2026-11-13T12:00:00Z');
    expect(formatFollowAge(new Date('2025-09-10T12:00:00Z'), now)).toBe('1 year, 2 months, 3 days');
    expect(formatFollowAge(new Date('2026-11-13T11:30:00Z'), now)).toBe('less than an hour');
  });

  it('calculates safely', () => {
    expect(calculate('2+3*4')).toBe('14');
    expect(calculate('(2+3)*4')).toBe('20');
    expect(calculate('2^10')).toBe('1024');
    expect(calculate('sqrt(16)+max(1,5)')).toBe('9');
    expect(calculate('process.exit()')).toBe('I can’t work that out.');
    expect(calculate('1/0')).toBe('I can’t work that out.');
  });
});

describe('spam filters', () => {
  it('measures messages', () => {
    expect(findLinkHosts('go to https://www.Twitch.tv/x and youtube.com/watch, ok?')).toEqual([
      'twitch.tv',
      'youtube.com',
    ]);
    expect(findLinkHosts('nice.. lol. what is this')).toEqual([]);
    expect(hostAllowed('clips.twitch.tv', ['twitch.tv'])).toBe(true);
    expect(hostAllowed('nottwitch.tv', ['twitch.tv'])).toBe(false);
    expect(capsPercent('HELLO there').percent).toBe(50);
    expect(symbolStats('!!!! hi')).toMatchObject({ symbols: 4 });
    expect(maxWordRepeats('lol LOL lol ok')).toBe(3);
    expect(hasZalgo('ź̂̃algo')).toBe(true);
    expect(hasZalgo('café')).toBe(false);
    expect(mentionCount('@a @b hi @c')).toBe(3);
    expect(longestWord('ok https://example.com/very/long/path aaaaaaaa')).toBe(8);
    expect(fancyPercent('\u{1D4F1}\u{1D4EE}\u{1D4F5}\u{1D4F5}\u{1D4F8}').percent).toBe(100);
    expect(fancyPercent('hello friends').percent).toBe(0);
    expect(estimateLines('x'.repeat(300), 0)).toBe(9);
  });

  it('counts repeats per chatter within the window', () => {
    const tracker = new RepeatTracker(60_000);
    expect(tracker.record('u', 'Spam  spam', 0)).toBe(1);
    expect(tracker.record('u', 'spam spam', 1000)).toBe(2);
    expect(tracker.record('other', 'spam spam', 1000)).toBe(1);
    expect(tracker.record('u', 'spam spam', 70_000)).toBe(1);
  });

  it('reports the first broken filter', () => {
    const filters = twitchChatConfigSchema.parse({
      filters: {
        links: { enabled: true, allowed: ['twitch.tv'] },
        caps: { enabled: true },
        emotes: { enabled: true, maxEmotes: 3 },
        zalgo: { enabled: true },
      },
    }).filters;
    const input = { repeats: 1, permitted: false, isSubscriber: false, emotes: 0 };
    expect(checkFilters(filters, { ...input, text: 'see twitch.tv/x' })).toBeNull();
    expect(checkFilters(filters, { ...input, text: 'see example.com' })).toBe('links');
    expect(
      checkFilters(filters, { ...input, permitted: true, text: 'see example.com' }),
    ).toBeNull();
    expect(checkFilters(filters, { ...input, text: 'THIS IS SO LOUD RIGHT NOW' })).toBe('caps');
    expect(checkFilters(filters, { ...input, emotes: 4, text: 'hi' })).toBe('emotes');
    expect(checkFilters(filters, { ...input, text: 'ź̂̃algo' })).toBe('zalgo');
    expect(checkFilters(filters, { ...input, text: 'hello chat' })).toBeNull();
  });
});

describe('blocked terms', () => {
  const matcher = compileBlockedTerms(
    twitchChatConfigSchema.parse({
      blockedTerms: {
        terms: [
          { id: 'a', phrase: 'frog' },
          { id: 'b', phrase: 'bad*word' },
          { id: 'c', phrase: '/buy (cheap )?followers/i', regex: true, action: 'ban' },
          { id: 'd', phrase: 'off', enabled: false },
        ],
      },
    }).blockedTerms,
  );

  it('matches plain terms anywhere, through lookalikes and spacing', () => {
    expect(findBlockedTerm(matcher, 'I love FROGS')?.id).toBe('a');
    expect(findBlockedTerm(matcher, 'fr0g')?.id).toBe('a');
    expect(findBlockedTerm(matcher, 'f r o g')?.id).toBe('a');
    expect(findBlockedTerm(matcher, 'badxxword')?.id).toBe('b');
    expect(findBlockedTerm(matcher, 'BUY cheap followers now')?.id).toBe('c');
    expect(findBlockedTerm(matcher, 'off topic')).toBeNull();
    expect(findBlockedTerm(matcher, 'hello chat')).toBeNull();
  });

  it('can switch lookalikes off', () => {
    const plain = compileBlockedTerms(
      twitchChatConfigSchema.parse({
        blockedTerms: { lookalikes: false, terms: [{ id: 'a', phrase: 'frog' }] },
      }).blockedTerms,
    );
    expect(findBlockedTerm(plain, 'fr0g')).toBeNull();
    expect(findBlockedTerm(plain, 'frog')?.id).toBe('a');
  });
});

describe('keywords', () => {
  const keyword = (groups: string[][], target: 'message' | 'username' | 'both' = 'message') => {
    const compiled = compileKeywords(
      twitchChatConfigSchema.parse({
        keywords: [{ id: 'k', name: 'k', groups, response: 'hi', target }],
      }).keywords,
    )[0];
    if (!compiled) throw new Error('no keyword');
    return compiled;
  };

  it('needs every phrase in a group, any group', () => {
    const k = keyword([
      ['discord', 'link'],
      ['join', 'server'],
    ]);
    expect(keywordMatches(k, 'whats the Discord link?', 'u')).toBe(true);
    expect(keywordMatches(k, 'how do I join the server', 'u')).toBe(true);
    expect(keywordMatches(k, 'discord?', 'u')).toBe(false);
  });

  it('supports regex, sensitive and negative flags and ignores spaces', () => {
    expect(compilePhrase('regex:^!?hi$')?.test('hi')).toBe(true);
    expect(compilePhrase('sensitive:Frog')?.test('frog')).toBe(false);
    expect(keywordMatches(keyword([['game', 'negative:valorant']]), 'what game is this', 'u')).toBe(
      true,
    );
    expect(
      keywordMatches(keyword([['game', 'negative:valorant']]), 'what game valorant?', 'u'),
    ).toBe(false);
    expect(keywordMatches(keyword([['what game']]), 'whatgame is it', 'u')).toBe(true);
    expect(keywordMatches(keyword([['bot']], 'username'), 'hello', 'spambot123')).toBe(true);
  });
});

describe('nukes', () => {
  it('parses phrases, scrollback, actions and radiation', () => {
    expect(parseNuke(['my', 'bad', 'phrase', '3m', '10m'])).toMatchObject({
      label: 'my bad phrase',
      scrollback: 180,
      action: { kind: 'timeout', seconds: 600 },
      radiation: 0,
    });
    const b = parseNuke(['/some.+bad/', '2m', 'ban', '-r=5m']);
    expect(b).toMatchObject({ scrollback: 120, action: { kind: 'ban' }, radiation: 300 });
    if ('error' in b) throw new Error(b.error);
    expect(b.pattern.test('SOME very BAD thing')).toBe(true);
    expect(parseNuke(['spam', '2m'])).toMatchObject({
      label: 'spam',
      scrollback: 120,
      action: { kind: 'timeout' },
    });
    expect('error' in parseNuke([])).toBe(true);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1h')).toBe(3600);
  });

  it('keeps ten minutes of chat history', () => {
    const history = new ChatHistory(10 * 60_000);
    history.add({ messageId: 'a', userId: '1', login: 'a', text: 'old', at: 0, exempt: false });
    history.add({
      messageId: 'b',
      userId: '2',
      login: 'b',
      text: 'new',
      at: 11 * 60_000,
      exempt: false,
    });
    expect(history.since(60_000, 11 * 60_000).map((l) => l.text)).toEqual(['new']);
  });
});

describe('song request links', () => {
  it('reads video ids from links and bare ids', () => {
    expect(youtubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('never gonna give you up')).toBeNull();
  });
});
