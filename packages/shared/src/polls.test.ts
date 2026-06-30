import { describe, expect, it } from 'vitest';
import { pollBar, tallyPoll } from './polls';

describe('tallyPoll', () => {
  it('counts votes and computes percentages', () => {
    const result = tallyPoll(
      ['Red', 'Blue', 'Green'],
      [{ optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 1 }, { optionIndex: 2 }],
    );
    expect(result.map((r) => r.count)).toEqual([2, 1, 1]);
    expect(result[0]?.percent).toBe(50);
    expect(result[1]?.percent).toBe(25);
  });

  it('handles no votes (all zero, no divide-by-zero)', () => {
    const result = tallyPoll(['A', 'B'], []);
    expect(result.map((r) => r.percent)).toEqual([0, 0]);
  });

  it('ignores out-of-range option indices', () => {
    const result = tallyPoll(
      ['A', 'B'],
      [{ optionIndex: 5 }, { optionIndex: -1 }, { optionIndex: 0 }],
    );
    expect(result[0]?.count).toBe(1);
    expect(result[1]?.count).toBe(0);
  });
});

describe('pollBar', () => {
  it('renders a proportional bar of fixed width', () => {
    expect(pollBar(0, 10)).toBe('░'.repeat(10));
    expect(pollBar(100, 10)).toBe('█'.repeat(10));
    expect(pollBar(50, 10)).toBe('█'.repeat(5) + '░'.repeat(5));
  });
});
