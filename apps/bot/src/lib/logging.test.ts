import { describe, expect, it } from 'vitest';
import { loggingConfigSchema } from '@refx/shared';
import { isIgnored } from './logging';

const config = loggingConfigSchema.parse({
  ignoredChannelIds: ['chan-1'],
  ignoredRoleIds: ['role-1'],
  ignoredUserIds: ['user-1'],
});

describe('isIgnored', () => {
  it('ignores by channel, user, or any matching role', () => {
    expect(isIgnored(config, { channelId: 'chan-1' })).toBe(true);
    expect(isIgnored(config, { userId: 'user-1' })).toBe(true);
    expect(isIgnored(config, { roleIds: ['x', 'role-1'] })).toBe(true);
  });

  it('does not ignore unmatched meta', () => {
    expect(isIgnored(config, { channelId: 'chan-2', userId: 'user-2' })).toBe(false);
    expect(isIgnored(config, { roleIds: ['x', 'y'] })).toBe(false);
    expect(isIgnored(config, {})).toBe(false);
  });
});
