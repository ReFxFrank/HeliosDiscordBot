import { describe, expect, it } from 'vitest';
import {
  eligibleVoiceMembers,
  levelFromXp,
  xpForLevel,
  xpProgress,
  type VoiceChannelView,
} from './leveling';

describe('xp curve', () => {
  it('xpForLevel starts at 0 and is strictly increasing', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(255);
    expect(xpForLevel(3)).toBeGreaterThan(xpForLevel(2));
  });

  it('levelFromXp inverts xpForLevel', () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(99)).toBe(0);
    expect(levelFromXp(100)).toBe(1);
    expect(levelFromXp(254)).toBe(1);
    expect(levelFromXp(255)).toBe(2);
  });

  it('xpProgress reports progress within the level', () => {
    const progress = xpProgress(150);
    expect(progress.level).toBe(1);
    expect(progress.current).toBe(50); // 150 - xpForLevel(1)
    expect(progress.needed).toBe(155); // xpForLevel(2) - xpForLevel(1)
  });
});

describe('eligibleVoiceMembers', () => {
  const channel = (overrides: Partial<VoiceChannelView>): VoiceChannelView => ({
    channelId: 'c1',
    isAfkChannel: false,
    members: [],
    ...overrides,
  });

  it('awards a channel with two or more active humans', () => {
    const result = eligibleVoiceMembers(
      channel({
        members: [
          { id: 'a', bot: false, deaf: false, roleIds: [] },
          { id: 'b', bot: false, deaf: false, roleIds: [] },
        ],
      }),
      [],
      [],
    );
    expect(result.sort()).toEqual(['a', 'b']);
  });

  it('does not reward someone sitting alone', () => {
    const result = eligibleVoiceMembers(
      channel({ members: [{ id: 'a', bot: false, deaf: false, roleIds: [] }] }),
      [],
      [],
    );
    expect(result).toEqual([]);
  });

  it('ignores bots and deafened members for the head-count and the award', () => {
    const result = eligibleVoiceMembers(
      channel({
        members: [
          { id: 'human', bot: false, deaf: false, roleIds: [] },
          { id: 'deaf', bot: false, deaf: true, roleIds: [] },
          { id: 'bot', bot: true, deaf: false, roleIds: [] },
        ],
      }),
      [],
      [],
    );
    expect(result).toEqual([]); // only one active human → nobody qualifies
  });

  it('excludes AFK channels, excluded channels, and no-XP roles', () => {
    const members = [
      { id: 'a', bot: false, deaf: false, roleIds: ['noxp'] },
      { id: 'b', bot: false, deaf: false, roleIds: [] },
    ];
    expect(eligibleVoiceMembers(channel({ isAfkChannel: true, members }), [], [])).toEqual([]);
    expect(eligibleVoiceMembers(channel({ members }), ['c1'], [])).toEqual([]);
    // head-count still counts the no-XP-role member, but they don't earn
    expect(eligibleVoiceMembers(channel({ members }), [], ['noxp'])).toEqual(['b']);
  });
});
