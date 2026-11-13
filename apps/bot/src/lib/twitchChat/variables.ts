import { calculate, eightBall, timeIn } from './external';

/**
 * `$(variable)` rendering for Twitch chat commands, keywords, timers and
 * alerts, Fossabot style. Variables nest: `$(urlencode $(query))` renders the
 * inner one first. Pure variables are handled here; anything that needs
 * Twitch, the database or the web goes through `ctx.lookup`, which is only
 * called for variables the text actually uses.
 */

export interface VariableContext {
  /** Display name of whoever triggered it ('' for timers). */
  user: string;
  /** Words after the command. */
  args: string[];
  channel: string;
  msgId?: string;
  bits?: number;
  /** Extra values for alerts: $(months), $(recipient)… */
  extra?: Record<string, string | number>;
  /** Service-backed variables; return null to leave the variable as typed. */
  lookup?: (name: string, arg: string, ctx: VariableContext) => Promise<string | null>;
  random?: () => number;
  now?: () => Date;
}

/** "@name" → "name", the way chatters type a target. */
export function stripAt(value: string): string {
  return value.replace(/^@+/, '');
}

export function touser(ctx: Pick<VariableContext, 'args' | 'user'>): string {
  return stripAt(ctx.args[0] ?? '') || ctx.user;
}

function randomBetween(spec: string, random: () => number): string | null {
  const match = spec.match(/^\s*(-?\d{1,9})\s*[-,\s]\s*(-?\d{1,9})\s*$/);
  if (!match) return null;
  let low = Number(match[1]);
  let high = Number(match[2]);
  if (low > high) [low, high] = [high, low];
  return String(low + Math.floor(random() * (high - low + 1)));
}

function pick(spec: string, random: () => number): string | null {
  const separator = spec.includes('|') ? '|' : ',';
  const options = spec
    .split(separator)
    .map((option) => option.trim())
    .filter(Boolean);
  if (options.length === 0) return null;
  return options[Math.floor(random() * options.length)] ?? null;
}

/** "3 days, 4 hours" for a span of milliseconds (two largest units). */
export function formatSpan(ms: number): string {
  let seconds = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const units: [string, number][] = [
    ['year', 365 * 86_400],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  const parts: string[] = [];
  for (const [unit, size] of units) {
    const n = Math.floor(seconds / size);
    if (n > 0) {
      parts.push(`${n} ${unit}${n === 1 ? '' : 's'}`);
      seconds -= n * size;
    }
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(', ') : '0 seconds';
}

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveBuiltin(
  name: string,
  arg: string,
  ctx: VariableContext,
): Promise<string | null> {
  const random = ctx.random ?? Math.random;
  const now = ctx.now?.() ?? new Date();

  // $(1), $(2:), $(1:3)
  const range = name.match(/^(\d+)(?::(\d*))?$/);
  if (range) {
    const start = Math.max(1, Number(range[1])) - 1;
    if (range[2] === undefined) return ctx.args[start] ?? '';
    const end = range[2] === '' ? ctx.args.length : Number(range[2]);
    return ctx.args.slice(start, end).join(' ');
  }

  const extra = ctx.extra?.[name];
  if (extra !== undefined) return String(extra);

  switch (name) {
    case 'user':
    case 'sender':
      return ctx.user;
    case 'touser':
      return touser(ctx);
    case 'query':
    case 'querystring':
      return name === 'querystring' ? encodeURIComponent(ctx.args.join(' ')) : ctx.args.join(' ');
    case 'channel':
      return ctx.channel;
    case 'msgid':
      return ctx.msgId ?? '';
    case 'bits':
      return String(ctx.bits ?? 0);
    case 'echo':
      return arg;
    case 'random':
    case 'randint':
      return randomBetween(arg || '1-100', random);
    case 'pick':
    case 'rngphrase':
      return pick(arg, random);
    case 'math':
      return calculate(arg);
    case 'repeat': {
      const match = arg.match(/^(\d{1,3})\s+([\s\S]+)$/);
      if (!match?.[1] || !match[2]) return null;
      return Array.from({ length: Math.min(Number(match[1]), 50) }, () => match[2]).join(' ');
    }
    case 'urlencode':
      return encodeURIComponent(arg);
    case 'urldecode':
      try {
        return decodeURIComponent(arg);
      } catch {
        return arg;
      }
    case 'pathencode':
      return arg.split('/').map(encodeURIComponent).join('/');
    case 'time':
      return timeIn(arg, now);
    case '8ball':
    case 'eightball':
      return eightBall(random);
    case 'countdown':
    case 'countup': {
      const date = parseDate(arg);
      if (!date) return 'Give a date like 2026-12-25.';
      const diff = date.getTime() - now.getTime();
      if (name === 'countdown') return diff > 0 ? formatSpan(diff) : 'now';
      return diff < 0 ? formatSpan(-diff) : 'not yet';
    }
    default:
      return null;
  }
}

/** Find the `)` that closes the `(` at index `open`. */
function closing(template: string, open: number): number {
  let depth = 0;
  for (let i = open; i < template.length; i++) {
    const char = template[i];
    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

async function render(template: string, ctx: VariableContext, depth: number): Promise<string> {
  if (depth > 5 || !template.includes('$(')) return template;
  let out = '';
  let i = 0;
  while (i < template.length) {
    const start = template.indexOf('$(', i);
    if (start === -1) {
      out += template.slice(i);
      break;
    }
    const end = closing(template, start + 1);
    if (end === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, start);
    const inner = template.slice(start + 2, end).trim();
    const space = inner.search(/\s/);
    const name = (space === -1 ? inner : inner.slice(0, space)).toLowerCase();
    const rawArg = space === -1 ? '' : inner.slice(space + 1);
    const arg = (await render(rawArg, ctx, depth + 1)).trim();
    let value: string | null = null;
    try {
      value = await resolveBuiltin(name, arg, ctx);
      if (value === null && ctx.lookup) value = await ctx.lookup(name, arg, ctx);
    } catch {
      value = null;
    }
    out += value ?? template.slice(start, end + 1);
    i = end + 1;
  }
  return out;
}

/** Fill every `$(…)`; unknown ones stay as typed. Capped at Twitch's 500. */
export async function renderTwitchTemplate(
  template: string,
  ctx: VariableContext,
): Promise<string> {
  const out = await render(template, ctx, 0);
  return out.replace(/\s+/g, ' ').trim().slice(0, 500);
}

/** "3h 05m", "12m", "45s". */
export function formatUptime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/** "1 year, 2 months, 5 days" between two dates (calendar-aware). */
export function formatFollowAge(from: Date, now: Date = new Date()): string {
  let years = now.getUTCFullYear() - from.getUTCFullYear();
  let months = now.getUTCMonth() - from.getUTCMonth();
  let days = now.getUTCDate() - from.getUTCDate();
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const parts: string[] = [];
  const add = (n: number, unit: string) => {
    if (n > 0) parts.push(`${n} ${unit}${n === 1 ? '' : 's'}`);
  };
  add(years, 'year');
  add(months, 'month');
  add(days, 'day');
  if (parts.length === 0) {
    const hours = Math.floor((now.getTime() - from.getTime()) / 3_600_000);
    return hours > 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : 'less than an hour';
  }
  return parts.join(', ');
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
