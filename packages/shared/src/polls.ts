/**
 * Pure poll helpers (§8). Kept framework-free so the tallying/rendering logic
 * is unit-testable independently of discord.js.
 */

export interface PollVoteRow {
  optionIndex: number;
}

export interface PollTallyEntry {
  index: number;
  label: string;
  count: number;
  percent: number;
}

/** Count votes per option and compute percentages (0 when there are no votes). */
export function tallyPoll(options: string[], votes: PollVoteRow[]): PollTallyEntry[] {
  const counts = options.map(() => 0);
  for (const vote of votes) {
    const index = vote.optionIndex;
    if (index >= 0 && index < counts.length) counts[index] = (counts[index] ?? 0) + 1;
  }
  const total = votes.length;
  return options.map((label, index) => ({
    index,
    label,
    count: counts[index] ?? 0,
    percent: total === 0 ? 0 : Math.round(((counts[index] ?? 0) / total) * 100),
  }));
}

/** A small unicode progress bar for poll results. */
export function pollBar(percent: number, width = 12): string {
  const filled = Math.round((percent / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}
