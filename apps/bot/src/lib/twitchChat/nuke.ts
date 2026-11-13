/**
 * !nuke: punish everyone who said a phrase (or matched a /regex/) in the last
 * few minutes, and optionally keep doing it for a while ("radiation").
 *
 *   !nuke <phrase|/regex/> [scrollback] [timeout length|delete|ban] [-r=length]
 *   !nuke my bad phrase 3m 10m      → look back 3 minutes, 10 minute timeouts
 *   !nuke /some.+regex/ 2m ban -r=5m → look back 2 minutes, ban, keep going 5m
 */

export type NukeAction =
  { kind: 'delete' } | { kind: 'ban' } | { kind: 'timeout'; seconds: number };

export interface NukeSpec {
  /** The phrase or regex source, for logs. */
  label: string;
  pattern: RegExp;
  /** Seconds of chat history to sweep. */
  scrollback: number;
  action: NukeAction;
  /** Seconds to keep punishing new matches. */
  radiation: number;
}

/** "90", "90s", "3m", "1h" → seconds. */
export function parseDuration(value: string): number | null {
  const match = value.trim().match(/^(\d{1,7})(s|m|h|d)?$/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  return n * (unit === 'm' ? 60 : unit === 'h' ? 3600 : unit === 'd' ? 86_400 : 1);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseNuke(args: string[]): NukeSpec | { error: string } {
  const rest = [...args];
  let radiation = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const match = rest[i]?.match(/^-r=(.+)$/i);
    if (match?.[1]) {
      const seconds = parseDuration(match[1]);
      if (seconds === null) return { error: 'Radiation length should look like -r=5m.' };
      radiation = Math.min(seconds, 3600);
      rest.splice(i, 1);
    }
  }

  // Trailing words that look like an action or durations belong to the options.
  let action: NukeAction = { kind: 'timeout', seconds: 600 };
  let scrollback = 60;
  const last = rest[rest.length - 1]?.toLowerCase();
  if (last === 'delete' || last === 'ban') {
    action = { kind: last };
    rest.pop();
  } else if (last && rest.length > 2 && parseDuration(last) !== null) {
    action = { kind: 'timeout', seconds: Math.min(parseDuration(last) ?? 600, 1_209_600) };
    rest.pop();
  }
  const maybeScroll = rest[rest.length - 1];
  if (maybeScroll && rest.length > 1 && parseDuration(maybeScroll) !== null) {
    scrollback = Math.min(parseDuration(maybeScroll) ?? 60, 600);
    rest.pop();
  }

  const phrase = rest.join(' ').trim();
  if (!phrase)
    return { error: 'Usage: !nuke <phrase|/regex/> [scrollback] [timeout|delete|ban] [-r=length]' };
  const regex = phrase.match(/^\/(.+)\/([a-z]*)$/i);
  let pattern: RegExp;
  try {
    pattern = regex?.[1]
      ? new RegExp(regex[1], (regex[2] ?? '').replace(/[gy]/g, '') || 'i')
      : new RegExp(escapeRegex(phrase), 'i');
  } catch {
    return { error: 'That regex doesn’t work.' };
  }
  return { label: phrase, pattern, scrollback, action, radiation };
}

/** Recent chat for nukes: the last 10 minutes per channel. */
export interface ChatLine {
  messageId: string;
  userId: string;
  login: string;
  text: string;
  at: number;
  exempt: boolean;
}

export class ChatHistory {
  private readonly lines: ChatLine[] = [];

  constructor(private readonly keepMs = 10 * 60_000) {}

  add(line: ChatLine): void {
    this.lines.push(line);
    const cutoff = line.at - this.keepMs;
    while (this.lines.length > 0 && (this.lines[0]?.at ?? 0) < cutoff) this.lines.shift();
    if (this.lines.length > 20_000) this.lines.splice(0, this.lines.length - 20_000);
  }

  since(ms: number, now = Date.now()): ChatLine[] {
    return this.lines.filter((line) => now - line.at <= ms);
  }
}
