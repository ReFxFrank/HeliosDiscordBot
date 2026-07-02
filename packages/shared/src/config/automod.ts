import { z } from 'zod';

/**
 * Auto-moderation (§8). Per-filter rules with an escalating action, plus global
 * role/channel exemptions. The content checks are pure + ReDoS-safe (no
 * user-supplied regex) so they're cheap to run on every message and testable.
 */

export const AUTOMOD_ACTIONS = ['delete', 'warn', 'timeout', 'kick', 'ban'] as const;
export type AutomodAction = (typeof AUTOMOD_ACTIONS)[number];

/** Actions available at the join gate (no message to delete). */
export const GATE_ACTIONS = ['kick', 'ban', 'timeout'] as const;
export type GateAction = (typeof GATE_ACTIONS)[number];

const ruleFields = {
  enabled: z.boolean().default(false),
  action: z.enum(AUTOMOD_ACTIONS).default('delete'),
  /** Used when action is `timeout`. */
  timeoutMinutes: z.number().int().min(1).max(10080).default(10),
};

export interface AutomodRule {
  enabled: boolean;
  action: AutomodAction;
  timeoutMinutes: number;
}

/**
 * Raid protection (§8). Two independent gates run on member join: an account-age
 * floor (catch throwaway alts) and a join-rate sliding window (catch join floods).
 * When the rate gate trips, "raid mode" arms for a cooldown so the trailing wave
 * of raiders is caught too.
 */
export const raidConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Reject accounts younger than this many hours. 0 disables the age gate. */
  minAccountAgeHours: z.number().int().min(0).max(8760).default(0),
  accountAgeAction: z.enum(GATE_ACTIONS).default('kick'),
  /** Join-rate trigger: this many joins within the window arms raid mode. */
  joinThreshold: z.number().int().min(2).max(100).default(10),
  joinWindowSeconds: z.number().int().min(1).max(300).default(10),
  raidAction: z.enum(GATE_ACTIONS).default('kick'),
  /** How long raid mode stays armed after the last trip. */
  raidModeDurationSeconds: z.number().int().min(30).max(3600).default(300),
  /** Where to post the "raid engaged" alert. Empty = member log channel. */
  alertChannelId: z.string().default(''),
  /** Used when an action is `timeout`. */
  timeoutMinutes: z.number().int().min(1).max(10080).default(60),
  /** Pause server invites while raid mode is armed (Discord incident action —
   *  auto-lifts when raid mode expires; needs Manage Server). */
  pauseInvites: z.boolean().default(false),
});
export type RaidConfig = z.infer<typeof raidConfigSchema>;

export const ANTI_NUKE_ACTIONS = ['strip-roles', 'kick', 'ban'] as const;
export type AntiNukeAction = (typeof ANTI_NUKE_ACTIONS)[number];

/**
 * Anti-nuke (§8): protects against a compromised (or rogue) mod/admin account
 * mass-destroying the server. Counts audit-log-attributed destructive actions
 * per ACTOR in a rolling window; past a threshold the actor is sanctioned and
 * the alert channel pinged. The guild owner and the bot are always exempt.
 */
export const antiNukeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Rolling window the counters live in. */
  windowSeconds: z.number().int().min(10).max(600).default(60),
  /** Bans + kicks by one actor within the window. */
  banKickThreshold: z.number().int().min(2).max(50).default(5),
  /** Channel deletions by one actor within the window. */
  channelDeleteThreshold: z.number().int().min(2).max(50).default(3),
  /** Role deletions by one actor within the window. */
  roleDeleteThreshold: z.number().int().min(2).max(50).default(3),
  /** What happens to the offending account. */
  action: z.enum(ANTI_NUKE_ACTIONS).default('strip-roles'),
  /** Extra trusted user ids (e.g. other bots) that are never sanctioned. */
  exemptUserIds: z.array(z.string()).max(25).default([]),
  /** Where the alert posts. Empty = member log channel. */
  alertChannelId: z.string().default(''),
});
export type AntiNukeConfig = z.infer<typeof antiNukeConfigSchema>;

export const automodConfigSchema = z.object({
  exemptRoleIds: z.array(z.string()).default([]),
  exemptChannelIds: z.array(z.string()).default([]),
  invites: z.object({ ...ruleFields }).default({}),
  links: z.object({ ...ruleFields, allowlist: z.array(z.string()).default([]) }).default({}),
  mentions: z
    .object({ ...ruleFields, maxMentions: z.number().int().min(1).max(50).default(5) })
    .default({}),
  caps: z
    .object({
      ...ruleFields,
      percent: z.number().int().min(50).max(100).default(70),
      minLength: z.number().int().min(1).max(2000).default(10),
    })
    .default({}),
  spam: z
    .object({
      ...ruleFields,
      maxMessages: z.number().int().min(2).max(30).default(5),
      windowSeconds: z.number().int().min(1).max(60).default(5),
    })
    .default({}),
  words: z.object({ ...ruleFields, list: z.array(z.string()).max(500).default([]) }).default({}),
  raid: raidConfigSchema.default({}),
  antiNuke: antiNukeConfigSchema.default({}),
  // NOTE: `verification` moved to its own module (config/verification.ts). Any
  // legacy key left in stored automod JSON is stripped harmlessly on parse.
});

export type AutomodConfig = z.infer<typeof automodConfigSchema>;

// ── Pure content checks ──────────────────────────────────────────────────────

// Anchored to Discord invite hosts only — a bare ".gg" branch would flag every
// op.gg / start.gg / tenor.gg link.
const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.(?:gg|io|me|li))\/[\w-]+/i;
export function containsInvite(content: string): boolean {
  return INVITE_RE.test(content);
}

// Matches scheme / www. / path-bearing links (the forms Discord auto-linkifies)
// so a scheme-less `www.evil.com` or `evil.com/x` can't bypass the allowlist,
// while bare dotted prose ("node.js") with no scheme/www/path is left alone.
// Userinfo and :port are captured separately so the host compares cleanly.
//                  1:scheme/www         userinfo          2:host                  3:port    4:path
const LINK_RE =
  /(https?:\/\/|www\.)?(?:[^\s/@]+@)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d+)?(\/[^\s]*)?/gi;

/** True if the content has any link whose host isn't covered by the allowlist. */
export function containsDisallowedLink(content: string, allowlist: string[]): boolean {
  const allow = allowlist.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  for (const match of content.matchAll(LINK_RE)) {
    // Only treat it as a link if it carries a scheme/www prefix or a path —
    // otherwise it's likely ordinary prose with a dot.
    if (!match[1] && !match[4]) continue;
    const host = (match[2] ?? '').toLowerCase();
    if (!host) continue;
    const ok = allow.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (!ok) return true;
  }
  return false;
}

/** Percentage of letters that are uppercase ≥ `percent`, once long enough. */
export function exceedsCaps(content: string, percent: number, minLength: number): boolean {
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length < minLength) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return (upper / letters.length) * 100 >= percent;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The first blocked word found (whole-word, case-insensitive), or null. Words
 * are escaped and joined into a single alternation — one safe regex per call,
 * no user-controlled quantifiers (ReDoS-safe).
 */
export function matchBlockedWord(content: string, words: string[]): string | null {
  const cleaned = words.map((word) => word.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const matcher = new RegExp(`\\b(?:${cleaned.map(escapeRegex).join('|')})\\b`, 'i');
  const found = content.match(matcher);
  return found ? found[0] : null;
}

// ── Raid-gate helpers (pure, testable) ───────────────────────────────────────

const HOUR_MS = 3_600_000;

/** True if an account is younger than the floor. A floor of 0 disables the gate. */
export function isAccountTooNew(
  createdAtMs: number,
  minAccountAgeHours: number,
  nowMs: number,
): boolean {
  if (minAccountAgeHours <= 0) return false;
  return nowMs - createdAtMs < minAccountAgeHours * HOUR_MS;
}

/**
 * Prune a per-guild join-timestamp window to `windowSeconds` and report whether
 * the count has reached the raid threshold. The caller pushes `nowMs` before
 * calling and stores the returned `recent` array back as the new window.
 */
export function evaluateJoinRate(
  timestamps: number[],
  windowSeconds: number,
  threshold: number,
  nowMs: number,
): { recent: number[]; raid: boolean } {
  const cutoff = nowMs - windowSeconds * 1000;
  const recent = timestamps.filter((ts) => ts > cutoff);
  return { recent, raid: recent.length >= threshold };
}
