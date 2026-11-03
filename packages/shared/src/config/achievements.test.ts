import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_PRESETS,
  achievementSchema,
  achievementsConfigSchema,
  isTieredAchievement,
  tierAt,
} from './achievements';

describe('achievement tiers', () => {
  it('maps tier index → label and clamps out-of-range indexes', () => {
    expect(tierAt(0)).toBe('bronze');
    expect(tierAt(1)).toBe('silver');
    expect(tierAt(2)).toBe('gold');
    expect(tierAt(3)).toBe('diamond');
    expect(tierAt(9)).toBe('diamond'); // clamp high
    expect(tierAt(-1)).toBe('bronze'); // clamp low
  });

  it('treats a single-tier achievement as not tiered', () => {
    expect(isTieredAchievement({ tiers: [1] })).toBe(false);
    expect(isTieredAchievement({ tiers: [1, 2] })).toBe(true);
    expect(isTieredAchievement({ tiers: [1, 2, 3, 4] })).toBe(true);
  });
});

describe('achievementSchema', () => {
  it('accepts a tiered achievement and applies reward defaults', () => {
    const parsed = achievementSchema.parse({
      id: 'a1',
      name: 'King of Spam',
      type: 'MESSAGES',
      tiers: [{ threshold: 25 }, { threshold: 250 }],
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.tiers).toHaveLength(2);
    expect(parsed.tiers[0]).toMatchObject({ threshold: 25, rewardXp: 0, rewardRoleId: null });
  });

  it('rejects an achievement with no tiers or more than four', () => {
    expect(() =>
      achievementSchema.parse({ id: 'a', name: 'n', type: 'LEVEL', tiers: [] }),
    ).toThrow();
    expect(() =>
      achievementSchema.parse({
        id: 'a',
        name: 'n',
        type: 'LEVEL',
        tiers: [
          { threshold: 1 },
          { threshold: 2 },
          { threshold: 3 },
          { threshold: 4 },
          { threshold: 5 },
        ],
      }),
    ).toThrow();
  });
});

describe('achievementsConfigSchema', () => {
  it('migrates a legacy single-threshold achievement into the tiers model', () => {
    const parsed = achievementsConfigSchema.parse({
      achievements: [
        {
          id: 'legacy',
          name: 'Old',
          type: 'LEVEL',
          threshold: 10,
          tier: 'silver',
          rewardRoleId: 'r1',
          rewardXp: 5,
        },
      ],
    });
    expect(parsed.achievements[0]?.tiers).toEqual([
      { threshold: 10, rewardRoleId: 'r1', rewardXp: 5 },
    ]);
  });

  it('rejects duplicate achievement ids', () => {
    expect(() =>
      achievementsConfigSchema.parse({
        achievements: [
          { id: 'dup', name: 'A', type: 'LEVEL', tiers: [{ threshold: 1 }] },
          { id: 'dup', name: 'B', type: 'MESSAGES', tiers: [{ threshold: 1 }] },
        ],
      }),
    ).toThrow();
  });

  it('defaults to announce + empty achievements', () => {
    const parsed = achievementsConfigSchema.parse({});
    expect(parsed.announce).toBe(true);
    expect(parsed.achievements).toEqual([]);
  });
});

describe('ACHIEVEMENT_PRESETS', () => {
  it('are all valid achievements once an id is assigned', () => {
    for (const preset of ACHIEVEMENT_PRESETS) {
      expect(() => achievementSchema.parse({ ...preset, id: preset.name })).not.toThrow();
    }
  });

  it('have unique names and ascending tier thresholds', () => {
    const names = ACHIEVEMENT_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const preset of ACHIEVEMENT_PRESETS) {
      const thresholds = preset.tiers.map((t) => t.threshold);
      const sorted = [...thresholds].sort((a, b) => a - b);
      expect(thresholds).toEqual(sorted);
    }
  });
});
