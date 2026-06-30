import { describe, expect, it } from 'vitest';
import { suggestionsConfigSchema } from './suggestions';

describe('suggestionsConfigSchema', () => {
  it('defaults to no channel, not anonymous, no staff roles', () => {
    const config = suggestionsConfigSchema.parse({});
    expect(config.channelId).toBeNull();
    expect(config.anonymous).toBe(false);
    expect(config.staffRoleIds).toEqual([]);
  });

  it('accepts a full config', () => {
    const config = suggestionsConfigSchema.parse({
      channelId: '123',
      anonymous: true,
      staffRoleIds: ['1', '2'],
    });
    expect(config.anonymous).toBe(true);
    expect(config.staffRoleIds).toHaveLength(2);
  });
});
