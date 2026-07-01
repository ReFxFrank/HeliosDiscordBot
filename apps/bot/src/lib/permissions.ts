import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type PermissionResolvable,
} from 'discord.js';
import { isModuleLocked, type Module } from '@solari/shared';
import { env } from '../env';
import type { BotContext } from '../framework/context';
import type { Precondition, PreconditionResult } from '../framework/command';

export type MemberLevel = 'owner' | 'admin' | 'mod' | 'member';

const OK: PreconditionResult = { ok: true };
const deny = (message: string): PreconditionResult => ({ ok: false, message });

export function isBotOwner(userId: string): boolean {
  return env.OWNER_IDS.includes(userId);
}

/**
 * Resolve a member's effective Solari permission level (§5.2):
 * bot owner -> Discord Administrator / configured admin role -> ModerateMembers
 * / configured mod role -> plain member.
 */
export async function resolveMemberLevel(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<MemberLevel> {
  if (isBotOwner(interaction.user.id)) return 'owner';
  if (!interaction.inCachedGuild()) return 'member';

  const perms = interaction.member.permissions;
  if (perms.has(PermissionFlagsBits.Administrator)) return 'admin';

  const { modRoleIds, adminRoleIds } = await ctx.config.getConfig(
    interaction.guildId,
    'MODERATION',
  );
  const roles = interaction.member.roles.cache;
  if (adminRoleIds.some((id) => roles.has(id))) return 'admin';
  if (perms.has(PermissionFlagsBits.ModerateMembers) || modRoleIds.some((id) => roles.has(id))) {
    return 'mod';
  }
  return 'member';
}

const LEVEL_RANK: Record<MemberLevel, number> = { member: 0, mod: 1, admin: 2, owner: 3 };

export function atLeast(level: MemberLevel, required: MemberLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

// ── Reusable preconditions ──────────────────────────────────────────────────

export const RequireGuild: Precondition = (interaction) =>
  interaction.inGuild() ? OK : deny('This command can only be used in a server.');

export function RequireUserPermissions(perms: PermissionResolvable): Precondition {
  return (interaction) => {
    if (!interaction.inGuild()) return deny('This command can only be used in a server.');
    return interaction.memberPermissions?.has(perms)
      ? OK
      : deny('You do not have permission to use this command.');
  };
}

export function RequireBotPermissions(perms: PermissionResolvable): Precondition {
  return (interaction) =>
    interaction.appPermissions?.has(perms)
      ? OK
      : deny("I'm missing the permissions I need to do that here.");
}

export function RequireLevel(required: MemberLevel): Precondition {
  return async (interaction, ctx) => {
    if (!interaction.inGuild()) return deny('This command can only be used in a server.');
    const level = await resolveMemberLevel(interaction, ctx);
    return atLeast(level, required) ? OK : deny('You do not have permission to use this command.');
  };
}

/** Mod-or-above gate backed by the configurable mod/admin roles. */
export const RequireModRole: Precondition = RequireLevel('mod');

/**
 * Premium paywall for premium-only modules. Reads the guild's tier (kept in sync
 * by the Stripe webhook) and denies non-premium servers.
 */
export function RequirePremium(module: Module): Precondition {
  return async (interaction, ctx) => {
    if (!interaction.inGuild()) return deny('This command can only be used in a server.');
    const guild = await ctx.prisma.guild.findUnique({
      where: { id: interaction.guildId },
      select: { premiumTier: true },
    });
    return isModuleLocked(module, guild?.premiumTier ?? 'FREE')
      ? deny('This is a Premium feature. Upgrade your server to unlock it.')
      : OK;
  };
}

/** Per-user, per-command cooldown. Held in-memory (per shard). */
export function Cooldown(seconds: number): Precondition {
  const lastUsed = new Map<string, number>();
  const windowMs = seconds * 1000;
  return (interaction) => {
    const key = `${interaction.commandName}:${interaction.user.id}`;
    const now = Date.now();
    const previous = lastUsed.get(key);
    if (previous !== undefined && now - previous < windowMs) {
      const remaining = Math.ceil((windowMs - (now - previous)) / 1000);
      return deny(`Slow down — try again in ${remaining}s.`);
    }
    lastUsed.set(key, now);
    return OK;
  };
}
