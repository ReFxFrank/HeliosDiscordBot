import {
  TWITCH_DEFAULT_LOOKALIKES,
  type TwitchBlockedTerm,
  type TwitchChatConfig,
  type TwitchFilterKey,
  type TwitchFilters,
} from '@refx/shared';

/**
 * Spam filters and blocked terms for Twitch chat. Pure checks: the chat
 * service decides who is exempt and carries out the action.
 */

const COMMON_TLDS =
  'com|net|org|tv|gg|io|co|me|ly|be|us|uk|de|xyz|app|dev|info|biz|link|live|shop|site|online|store|club|ru|cn|fr|ca|au|in|jp|gl|to|sh|tk|ml|ga|cf|gq|lol|fun|top|page|stream';

const URL_PATTERN = new RegExp(
  String.raw`(?:https?:\/\/[^\s]+)|(?:www\.[^\s]+)|(?:\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${COMMON_TLDS})\b(?:\/[^\s]*)?)`,
  'gi',
);

/** Hosts of the links in a message ("https://www.Twitch.tv/x" → "twitch.tv"). */
export function findLinkHosts(text: string): string[] {
  const hosts: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(/^https?:\/\//i, '');
    const host = raw
      .split(/[/?#:]/)[0]
      ?.toLowerCase()
      .replace(/^www\./, '')
      .replace(/[.,!?)\]]+$/, '');
    if (host) hosts.push(host);
  }
  return hosts;
}

export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => {
    const domain = entry
      .replace(/^https?:\/\//, '')
      .replace(/^\*?\.?/, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    return domain !== '' && (host === domain || host.endsWith(`.${domain}`));
  });
}

export function capsPercent(text: string): { letters: number; percent: number } {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  const upper = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase());
  return {
    letters: letters.length,
    percent: letters.length === 0 ? 0 : (upper.length / letters.length) * 100,
  };
}

export function symbolStats(text: string): { chars: number; symbols: number; percent: number } {
  const chars = [...text.replace(/\s+/g, '')];
  const symbols = chars.filter((c) => !/[\p{L}\p{N}]/u.test(c)).length;
  return {
    chars: chars.length,
    symbols,
    percent: chars.length === 0 ? 0 : (symbols / chars.length) * 100,
  };
}

/** Estimated lines a message fills in a standard-width chat column. */
export function estimateLines(text: string, emotes: number, nameLength = 12): number {
  const width = [...text].length + emotes * 3 + nameLength + 2;
  return Math.ceil(width / 38);
}

/** How often the most repeated word or emote appears. */
export function maxWordRepeats(text: string): number {
  const counts = new Map<string, number>();
  let max = 0;
  for (const word of text.toLowerCase().split(/\s+/)) {
    if (!word) continue;
    const next = (counts.get(word) ?? 0) + 1;
    counts.set(word, next);
    if (next > max) max = next;
  }
  return max;
}

export function hasZalgo(text: string): boolean {
  return /\p{M}{3,}/u.test(text);
}

export function mentionCount(text: string): number {
  return (text.match(/(^|\s)@\w+/g) ?? []).length;
}

export function longestWord(text: string): number {
  return text
    .split(/\s+/)
    .filter((word) => !/^https?:\/\//i.test(word))
    .reduce((max, word) => Math.max(max, [...word].length), 0);
}

/** Share of "fancy" lookalike letters (math bold/script, fullwidth, circled, small caps…). */
export function fancyPercent(text: string): { letters: number; percent: number } {
  const chars = [...text].filter((c) => /[\p{L}\p{N}]/u.test(c) || isFancy(c));
  const fancy = chars.filter(isFancy).length;
  return { letters: chars.length, percent: chars.length === 0 ? 0 : (fancy / chars.length) * 100 };
}

function isFancy(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1d400 && code <= 0x1d7ff) || // mathematical alphanumerics
    (code >= 0xff01 && code <= 0xff5e) || // fullwidth
    (code >= 0x24b6 && code <= 0x24e9) || // circled letters
    (code >= 0x1f130 && code <= 0x1f189) || // squared / negative letters
    (code >= 0x1f1e6 && code <= 0x1f1ff) || // regional indicators used as letters
    (code >= 0x1d00 && code <= 0x1d7f) || // small caps / phonetic
    (code >= 0x0250 && code <= 0x02af) // IPA (upside-down text)
  );
}

/** Per-chatter message history for the repeated-messages filter. */
export class RepeatTracker {
  private readonly history = new Map<string, { text: string; at: number }[]>();

  constructor(private readonly windowMs = 60_000) {}

  /** Record a message and return how many times it was sent in the window. */
  record(key: string, text: string, now = Date.now()): number {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const recent = (this.history.get(key) ?? []).filter((m) => now - m.at < this.windowMs);
    recent.push({ text: normalized, at: now });
    this.history.set(key, recent.slice(-20));
    if (this.history.size > 5000) this.prune(now);
    return recent.filter((m) => m.text === normalized).length;
  }

  private prune(now: number): void {
    for (const [key, list] of this.history) {
      if (list.every((m) => now - m.at >= this.windowMs)) this.history.delete(key);
    }
  }
}

export interface FilterInput {
  /** Message text without emotes. */
  text: string;
  emotes: number;
  /** Times this chatter sent the same text in the last minute (incl. this). */
  repeats: number;
  /** A mod ran !permit for this chatter recently. */
  permitted: boolean;
  isSubscriber: boolean;
  nameLength?: number;
}

/** Filters in the order they're checked. */
const ORDER: TwitchFilterKey[] = [
  'zalgo',
  'links',
  'repeat',
  'emotes',
  'mentions',
  'longWord',
  'height',
  'length',
  'wordRepeat',
  'unicode',
  'caps',
  'symbols',
];

/** The first filter the message breaks, or null. */
export function checkFilters(filters: TwitchFilters, input: FilterInput): TwitchFilterKey | null {
  const { text } = input;
  for (const key of ORDER) {
    if (!filters[key].enabled) continue;
    if (breaks(filters, key, input, text)) return key;
  }
  return null;
}

function breaks(filters: TwitchFilters, key: TwitchFilterKey, input: FilterInput, text: string) {
  switch (key) {
    case 'links': {
      if (input.permitted || (filters.links.allowSubscribers && input.isSubscriber)) return false;
      return findLinkHosts(text).some((host) => !hostAllowed(host, filters.links.allowed));
    }
    case 'caps': {
      const { letters, percent } = capsPercent(text);
      return letters >= filters.caps.minLength && percent >= filters.caps.maxPercent;
    }
    case 'symbols': {
      const { chars, symbols, percent } = symbolStats(text);
      return (
        symbols > filters.symbols.maxCount ||
        (chars >= filters.symbols.minLength && percent >= filters.symbols.maxPercent)
      );
    }
    case 'length':
      return [...text].length > filters.length.maxLength;
    case 'height':
      return estimateLines(text, input.emotes, input.nameLength) > filters.height.maxLines;
    case 'wordRepeat':
      return maxWordRepeats(text) >= filters.wordRepeat.maxRepeats;
    case 'repeat':
      return input.repeats >= filters.repeat.count;
    case 'emotes':
      return input.emotes > filters.emotes.maxEmotes;
    case 'zalgo':
      return hasZalgo(text);
    case 'mentions':
      return mentionCount(text) > filters.mentions.maxMentions;
    case 'longWord':
      return longestWord(text) > filters.longWord.maxLength;
    case 'unicode': {
      const { letters, percent } = fancyPercent(text);
      return letters >= filters.unicode.minLength && percent >= filters.unicode.maxPercent;
    }
  }
}

// ── Blocked terms ───────────────────────────────────────────────────────────

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse "ß=b" lines into extra lookalike swaps. */
export function parseLookalikes(extra: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of extra.split(/\r?\n/)) {
    const match = line.trim().match(/^(\S+)\s*=\s*(\S)$/u);
    if (match?.[1] && match[2]) map[match[1]] = match[2].toLowerCase();
  }
  return map;
}

export function normalizeLookalikes(text: string, map: Record<string, string>): string {
  let out = '';
  for (const char of text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')) {
    out += map[char] ?? char;
  }
  return out;
}

export interface CompiledTerm {
  term: TwitchBlockedTerm;
  pattern: RegExp;
}

export interface BlockedTermMatcher {
  terms: CompiledTerm[];
  lookalikes: Record<string, string> | null;
}

export function compileBlockedTerms(config: TwitchChatConfig['blockedTerms']): BlockedTermMatcher {
  const terms: CompiledTerm[] = [];
  for (const term of config.terms) {
    if (!term.enabled) continue;
    try {
      if (term.regex) {
        const match = term.phrase.match(/^\/(.*)\/([a-z]*)$/s);
        const source = match?.[1] ?? term.phrase;
        const flags = (match?.[2] ?? 'i').replace(/[gy]/g, '');
        terms.push({
          term,
          pattern: new RegExp(source, flags.includes('u') ? flags : `${flags}u`),
        });
      } else {
        const source = term.phrase
          .toLowerCase()
          .split('*')
          .map(escapeRegex)
          .join('[\\p{L}\\p{N}]*');
        terms.push({ term, pattern: new RegExp(source, 'iu') });
      }
    } catch {
      // Invalid regex: skipped (the dashboard refuses to save these).
    }
  }
  return {
    terms,
    lookalikes: config.lookalikes
      ? { ...TWITCH_DEFAULT_LOOKALIKES, ...parseLookalikes(config.extraLookalikes) }
      : null,
  };
}

/** The first blocked term the message contains. */
export function findBlockedTerm(
  matcher: BlockedTermMatcher,
  text: string,
): TwitchBlockedTerm | null {
  if (matcher.terms.length === 0) return null;
  const variants = [text, text.toLowerCase()];
  if (matcher.lookalikes) {
    const normalized = normalizeLookalikes(text, matcher.lookalikes);
    variants.push(normalized, normalized.replace(/[\s._-]+/g, ''));
  }
  for (const { term, pattern } of matcher.terms) {
    if (variants.some((variant) => pattern.test(variant))) return term;
  }
  return null;
}
