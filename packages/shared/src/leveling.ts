/**
 * Shared XP curve so the bot and dashboard agree on levels. MEE6-style
 * cumulative curve: the XP needed to go from level `l` to `l+1` is
 * `5*l^2 + 50*l + 100`.
 */

/** Total cumulative XP required to reach a given level (level 0 == 0 XP). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) {
    total += 5 * l * l + 50 * l + 100;
  }
  return total;
}

/** The level a given total XP corresponds to. */
export function levelFromXp(xp: number): number {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

/** Progress within the current level: `current`/`needed` XP toward the next. */
export function xpProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - base, needed: next - base };
}

// ── Voice XP eligibility (pure, testable) ────────────────────────────────────

export interface VoiceMemberView {
  id: string;
  bot: boolean;
  /** Self- or server-deafened — deafened members earn no voice XP. */
  deaf: boolean;
  roleIds: string[];
}

export interface VoiceChannelView {
  channelId: string;
  /** The guild's designated AFK channel earns no XP. */
  isAfkChannel: boolean;
  members: VoiceMemberView[];
}

/**
 * Which members in a voice channel earn XP this tick. A channel must hold at
 * least two active (non-bot, non-deafened) humans — this blocks the classic
 * sit-alone-in-voice farm. Deafened members, bots, AFK/excluded channels, and
 * no-XP roles are all filtered out.
 */
export function eligibleVoiceMembers(
  channel: VoiceChannelView,
  noXpChannelIds: string[],
  noXpRoleIds: string[],
): string[] {
  if (channel.isAfkChannel || noXpChannelIds.includes(channel.channelId)) return [];
  const active = channel.members.filter((member) => !member.bot && !member.deaf);
  if (active.length < 2) return [];
  const excluded = new Set(noXpRoleIds);
  return active
    .filter((member) => !member.roleIds.some((roleId) => excluded.has(roleId)))
    .map((member) => member.id);
}
