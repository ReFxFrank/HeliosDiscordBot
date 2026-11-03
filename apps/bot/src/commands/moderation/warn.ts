import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type User,
} from 'discord.js';
import type { EscalationRung } from '@refx/shared';
import type { Command } from '../../framework/command';
import type { BotContext } from '../../framework/context';
import { RequireGuild, RequireUserPermissions } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { createModerationCase } from '../../lib/cases';
import {
  activeWarnCount,
  matchEscalation,
  moderationTargetError,
  postModLog,
} from '../../lib/moderation';
import { formatDuration } from '../../lib/parsing';

/**
 * Apply an escalation rung's auto-punishment. Best-effort: returns a short note
 * for the case embed, or null if it couldn't be applied (e.g. the member left,
 * or the bot lacks permission — the warn itself still stands).
 */
async function applyEscalation(
  interaction: ChatInputCommandInteraction<'cached'>,
  ctx: BotContext,
  target: User,
  targetMember: GuildMember | null,
  rung: EscalationRung,
): Promise<string | null> {
  const reason = `Auto-escalation at ${rung.threshold} warns`;
  try {
    if (rung.action === 'timeout') {
      if (!targetMember) return null;
      const seconds = rung.durationMinutes * 60;
      await targetMember.timeout(seconds * 1000, reason);
      await createModerationCase({
        guildId: interaction.guildId,
        type: 'MUTE',
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
        durationSeconds: seconds,
        expiresAt: new Date(Date.now() + seconds * 1000),
      });
      return `Timed out for ${formatDuration(seconds)}.`;
    }
    if (rung.action === 'kick') {
      if (!targetMember) return null;
      await targetMember.kick(reason);
      await createModerationCase({
        guildId: interaction.guildId,
        type: 'KICK',
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
      });
      return 'Kicked.';
    }
    await interaction.guild.members.ban(target.id, { reason });
    await createModerationCase({
      guildId: interaction.guildId,
      type: 'BAN',
      targetId: target.id,
      moderatorId: interaction.user.id,
      reason,
    });
    return 'Banned.';
  } catch (err) {
    ctx.logger.warn({ err, target: target.id, action: rung.action }, 'Escalation action failed');
    return null;
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member and log the case.')
    .addUserOption((o) => o.setName('user').setDescription('The member to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  module: 'MODERATION',
  preconditions: [RequireGuild, RequireUserPermissions(PermissionFlagsBits.ModerateMembers)],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const config = await ctx.config.getConfig(interaction.guildId, 'MODERATION');

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    const guardError = moderationTargetError({
      targetId: target.id,
      actorId: interaction.user.id,
      botId: ctx.client.user?.id,
      guildOwnerId: interaction.guild.ownerId,
      targetMember,
      immuneRoleIds: config.immuneRoleIds,
      actionVerb: 'warn',
    });
    if (guardError) {
      await interaction.reply({ embeds: [errorEmbed(guardError)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();

    const warnCase = await createModerationCase({
      guildId: interaction.guildId,
      type: 'WARN',
      targetId: target.id,
      moderatorId: interaction.user.id,
      reason,
    });

    if (config.dmOnAction) {
      await target
        .send(`You were warned in **${interaction.guild.name}**.\nReason: ${reason}`)
        .catch(() => undefined);
    }

    // Escalation: does reaching this active-warn count trip a configured rung?
    const count = await activeWarnCount(interaction.guildId, target.id);
    const rung = matchEscalation(config.escalation, count);
    const escalationNote = rung
      ? await applyEscalation(interaction, ctx, target, targetMember, rung)
      : null;

    const embed = brandedEmbed({
      kind: 'warning',
      title: `Case #${warnCase.caseNumber} · Warn`,
      description: [
        `**User:** ${target.tag} (\`${target.id}\`)`,
        `**Moderator:** ${interaction.user.tag}`,
        `**Reason:** ${reason}`,
        `**Active warns:** ${count}`,
        escalationNote ? `**Escalation:** ${escalationNote}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    await interaction.editReply({ embeds: [embed] });
    await postModLog(ctx, interaction.guildId, config, embed);
  },
};

export default command;
