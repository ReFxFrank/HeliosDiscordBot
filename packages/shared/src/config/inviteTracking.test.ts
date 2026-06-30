import { describe, expect, it } from 'vitest';
import { diffInviteUse, inviteTrackingConfigSchema, type InviteSnapshot } from './inviteTracking';

const snap = (code: string, uses: number, inviterId: string | null = 'u1'): InviteSnapshot => ({
  code,
  uses,
  inviterId,
});

describe('inviteTrackingConfigSchema', () => {
  it('defaults to no log channel', () => {
    expect(inviteTrackingConfigSchema.parse({}).logChannelId).toBeNull();
  });
});

describe('diffInviteUse', () => {
  it('attributes the join to the single incremented invite', () => {
    const before = [snap('aaa', 3, 'inviterA'), snap('bbb', 1, 'inviterB')];
    const after = [snap('aaa', 4, 'inviterA'), snap('bbb', 1, 'inviterB')];
    expect(diffInviteUse(before, after)).toEqual({ code: 'aaa', inviterId: 'inviterA' });
  });

  it('returns null when two invites incremented (concurrent joins)', () => {
    const before = [snap('aaa', 3), snap('bbb', 1)];
    const after = [snap('aaa', 4), snap('bbb', 2)];
    expect(diffInviteUse(before, after)).toBeNull();
  });

  it('attributes to a single vanished (maxed-out single-use) invite', () => {
    const before = [snap('aaa', 0, 'inviterA'), snap('bbb', 5, 'inviterB')];
    const after = [snap('bbb', 5, 'inviterB')];
    expect(diffInviteUse(before, after)).toEqual({ code: 'aaa', inviterId: 'inviterA' });
  });

  it('returns null when nothing changed or multiple vanished', () => {
    const same = [snap('aaa', 3), snap('bbb', 1)];
    expect(diffInviteUse(same, same)).toBeNull();
    const before = [snap('aaa', 1), snap('bbb', 1), snap('ccc', 1)];
    const after = [snap('ccc', 1)];
    expect(diffInviteUse(before, after)).toBeNull();
  });

  it('carries a null inviter (vanity) through', () => {
    const before = [snap('vanity', 10, null)];
    const after = [snap('vanity', 11, null)];
    expect(diffInviteUse(before, after)).toEqual({ code: 'vanity', inviterId: null });
  });
});
