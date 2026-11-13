import { describe, expect, it } from 'vitest';
import {
  twitchCanUse,
  twitchChatConfigProblems,
  twitchChatConfigSchema,
  twitchLevelFromBadges,
} from './twitchChat';

const command = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  response: 'hi $(user)',
  ...extra,
});

describe('twitchChatConfigSchema', () => {
  it('fills defaults from an empty blob', () => {
    const config = twitchChatConfigSchema.parse({});
    expect(config.channel).toBeNull();
    expect(config.commands).toEqual([]);
    expect(config.defaults.uptime).toEqual({ enabled: true, permission: 'everyone', cooldown: 5 });
    expect(config.defaults.urban.enabled).toBe(false);
    expect(config.defaults.nuke.permission).toBe('moderator');
    expect(config.filters.exempt).toBe('vip');
    expect(config.filters.links.enabled).toBe(false);
    expect(config.filters.escalation.enabled).toBe(true);
    expect(config.alerts.sub.enabled).toBe(true);
    expect(config.alerts.follow.enabled).toBe(false);
    expect(config.songs.enabled).toBe(false);
  });

  it('upgrades settings saved by the first version', () => {
    const config = twitchChatConfigSchema.parse({
      channel: 'thesleepyfroggo',
      builtins: { uptime: false, shoutout: false, commands: true },
      commands: [command('a', 'discord', { reply: true })],
      timers: [
        {
          id: 't',
          name: 'Discord',
          message: 'join!',
          interval: 20,
          onlineOnly: false,
          minLines: 3,
        },
      ],
      filters: {
        caps: { enabled: true, action: 'delete' },
        words: { enabled: true, list: ['frog', 'toad*'] },
      },
    });
    expect(config.defaults.uptime.enabled).toBe(false);
    expect(config.defaults.so.enabled).toBe(false);
    expect(config.defaults.commands.enabled).toBe(true);
    expect(config.commands[0]?.responseType).toBe('reply');
    expect(config.timers[0]).toMatchObject({
      messages: ['join!'],
      liveInterval: 20,
      offlineInterval: 20,
      minLines: 3,
    });
    expect(config.filters.caps).toMatchObject({ enabled: true, action: 'delete' });
    expect(config.blockedTerms.terms.map((t) => t.phrase)).toEqual(['frog', 'toad*']);
  });

  it('cleans up the channel and command names', () => {
    const config = twitchChatConfigSchema.parse({
      channel: 'https://www.twitch.tv/TheSleepyFroggo',
      commands: [command('a', '!Discord', { aliases: ['!DC'] })],
    });
    expect(config.channel).toBe('thesleepyfroggo');
    expect(config.commands[0]?.name).toBe('discord');
    expect(config.commands[0]?.aliases).toEqual(['dc']);
    expect(twitchChatConfigSchema.parse({ channel: '' }).channel).toBeNull();
    expect(twitchChatConfigSchema.safeParse({ channel: 'no spaces allowed' }).success).toBe(false);
  });

  it('rejects clashes with enabled default commands and between commands', () => {
    expect(twitchChatConfigSchema.safeParse({ commands: [command('a', 'uptime')] }).success).toBe(
      false,
    );
    // Turning the default off frees the name.
    expect(
      twitchChatConfigSchema.safeParse({
        defaults: { uptime: { enabled: false } },
        commands: [command('a', 'uptime')],
      }).success,
    ).toBe(true);
    const base = twitchChatConfigSchema.parse({
      commands: [command('a', 'socials'), command('b', 'links')],
    });
    const [first, second] = base.commands;
    if (!first || !second) throw new Error('missing commands');
    const problems = twitchChatConfigProblems({
      ...base,
      commands: [first, { ...second, aliases: ['socials'] }],
    });
    expect(problems[0]).toBe('Command !links: !socials is used by two commands.');
  });

  it('rejects bad names, empty responses and broken regex terms', () => {
    expect(
      twitchChatConfigSchema.safeParse({ commands: [command('a', 'has space')] }).success,
    ).toBe(false);
    expect(
      twitchChatConfigSchema.safeParse({ commands: [command('a', 'ok', { response: '  ' })] })
        .success,
    ).toBe(false);
    expect(
      twitchChatConfigSchema.safeParse({
        blockedTerms: { terms: [{ id: 'x', phrase: '([', regex: true }] },
      }).success,
    ).toBe(false);
  });
});

describe('Twitch chat permissions', () => {
  it('reads the highest badge', () => {
    expect(twitchLevelFromBadges([])).toBe('everyone');
    expect(twitchLevelFromBadges(['subscriber', 'premium'])).toBe('subscriber');
    expect(twitchLevelFromBadges(['founder'])).toBe('subscriber');
    expect(twitchLevelFromBadges(['subscriber', 'vip'])).toBe('vip');
    expect(twitchLevelFromBadges(['moderator', 'subscriber'])).toBe('moderator');
    expect(twitchLevelFromBadges(['broadcaster', 'subscriber'])).toBe('broadcaster');
  });

  it('lets higher levels use lower commands', () => {
    expect(twitchCanUse('moderator', 'vip')).toBe(true);
    expect(twitchCanUse('vip', 'subscriber')).toBe(true);
    expect(twitchCanUse('subscriber', 'vip')).toBe(false);
  });
});
