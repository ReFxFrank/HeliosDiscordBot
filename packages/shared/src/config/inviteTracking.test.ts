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

  it('ignores an invite that only appears in `after` (no baseline) and credits the real one', () => {
    // `new` (a late/dropped InviteCreate, or a reappearing vanity) has uses ≥ 1
    // but no prior snapshot — it must NOT mask the genuinely incremented `old`.
    const before = [snap('old', 3, 'inviterA')];
    const after = [snap('old', 4, 'inviterA'), snap('new', 1, 'inviterB')];
    expect(diffInviteUse(before, after)).toEqual({ code: 'old', inviterId: 'inviterA' });
  });

  it('still resolves the vanished invite when a phantom appears alongside it', () => {
    // single-use `old` maxed out & vanished; a reappearing vanity shows in after.
    const before = [snap('old', 0, 'inviterA'), snap('keep', 5, 'inviterC')];
    const after = [snap('keep', 5, 'inviterC'), snap('vanity', 99, null)];
    expect(diffInviteUse(before, after)).toEqual({ code: 'old', inviterId: 'inviterA' });
  });
});
