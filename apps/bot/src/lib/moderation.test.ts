import { describe, expect, it } from 'vitest';
import type { GuildMember } from 'discord.js';
import type { EscalationRung } from '@refx/shared';
import { isImmuneMember, matchEscalation, moderationTargetError } from './moderation';

const fakeMember = (roleIds: string[]): GuildMember =>
  ({ roles: { cache: new Set(roleIds) } }) as unknown as GuildMember;

const ladder: EscalationRung[] = [
  { threshold: 3, action: 'timeout', durationMinutes: 60 },
  { threshold: 5, action: 'kick', durationMinutes: 60 },
];

describe('matchEscalation', () => {
  it('fires only at an exact warn count (once per threshold)', () => {
    expect(matchEscalation(ladder, 3)?.action).toBe('timeout');
    expect(matchEscalation(ladder, 5)?.action).toBe('kick');
  });

  it('does not fire between rungs, below the first, or above the last', () => {
    expect(matchEscalation(ladder, 1)).toBeNull();
    expect(matchEscalation(ladder, 4)).toBeNull();
    expect(matchEscalation(ladder, 10)).toBeNull();
  });
});

describe('isImmuneMember', () => {
  it('is true only when the member holds an immune role', () => {
    expect(isImmuneMember(fakeMember(['imm']), ['imm'])).toBe(true);
    expect(isImmuneMember(fakeMember(['other']), ['imm'])).toBe(false);
    expect(isImmuneMember(fakeMember([]), [])).toBe(false);
  });
});

describe('moderationTargetError', () => {
  const base = {
    actorId: 'mod',
    botId: 'bot',
    guildOwnerId: 'owner',
    immuneRoleIds: ['imm'],
    actionVerb: 'warn',
  };

  it('blocks self, the bot, the owner, and immune members', () => {
    expect(moderationTargetError({ ...base, targetId: 'mod', targetMember: null })).toMatch(
      /yourself/,
    );
    expect(moderationTargetError({ ...base, targetId: 'bot', targetMember: null })).toMatch(
      /myself/,
    );
    expect(moderationTargetError({ ...base, targetId: 'owner', targetMember: null })).toMatch(
      /owner/,
    );
    expect(
      moderationTargetError({ ...base, targetId: 't', targetMember: fakeMember(['imm']) }),
    ).toMatch(/immune/);
  });

  it('allows a normal target', () => {
    expect(
      moderationTargetError({ ...base, targetId: 't', targetMember: fakeMember(['other']) }),
    ).toBeNull();
  });
});
