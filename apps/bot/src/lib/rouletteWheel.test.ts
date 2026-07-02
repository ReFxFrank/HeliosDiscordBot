import { describe, expect, it } from 'vitest';
import { renderRouletteSpin, ROULETTE_SPIN_MS, WHEEL_ORDER } from './rouletteWheel';

describe('WHEEL_ORDER', () => {
  it('contains every pocket 0–36 exactly once (European wheel)', () => {
    expect(WHEEL_ORDER).toHaveLength(37);
    expect(new Set(WHEEL_ORDER).size).toBe(37);
    for (let pocket = 0; pocket <= 36; pocket++) {
      expect(WHEEL_ORDER).toContain(pocket);
    }
  });
});

describe('renderRouletteSpin', () => {
  it('renders a GIF, caches it, and rejects bad pockets', () => {
    const first = renderRouletteSpin(17);
    // GIF89a magic bytes + a sane size for a ~4s animation.
    expect(first.subarray(0, 6).toString('ascii')).toBe('GIF89a');
    expect(first.length).toBeGreaterThan(10_000);
    expect(first.length).toBeLessThan(8_000_000);
    // Cached: same buffer instance back.
    expect(renderRouletteSpin(17)).toBe(first);
    expect(() => renderRouletteSpin(37)).toThrow();
    expect(ROULETTE_SPIN_MS).toBeGreaterThan(2_000);
  });
});
