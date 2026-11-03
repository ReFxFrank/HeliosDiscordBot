import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type GuildMember,
} from 'discord.js';
import { parseApplicationQuestions } from '@refx/shared';
import type { ApplicationStatus } from '@refx/database';
import { errorEmbed, successEmbed } from '../lib/embeds';
import { defineComponent } from '../framework/component';
import {
  buildApplicationModal,
  decideApplication,
  getApplicationsConfig,
  getFormById,
  modalFieldValue,
  readModalAnswers,
  recordSubmission,
} from '../modules/applications';

function canReview(member: GuildMember, staffRoleIds: string[]): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return staffRoleIds.some((id) => member.roles.cache.has(id));
}

const isDecision = (value: string): value is ApplicationStatus =>
  value === 'APPROVED' || value === 'DENIED';

export default defineComponent({
  module: 'apply',
  async handle(interaction, parsed, ctx) {
    if (!interaction.inCachedGuild()) return;
    const deps = { client: ctx.client, logger: ctx.logger };

    // ── Member opens a form (panel button) ──────────────────────────────────
    if (interaction.isButton() && parsed.action === 'open') {
      if (!(await ctx.config.isEnabled(interaction.guildId, 'APPLICATIONS'))) {
        await interaction.reply({
          embeds: [errorEmbed('Applications are disabled on this server.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const form = await getFormById(parsed.args[0] ?? '');
      if (!form || form.guildId !== interaction.guildId || !form.enabled) {
        await interaction.reply({
          embeds: [errorEmbed('That application form is no longer available.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (parseApplicationQuestions(form.questions).length === 0) {
        await interaction.reply({
          embeds: [errorEmbed('This form has no questions yet — ask an admin to add some.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.showModal(buildApplicationModal(form));
      return;
    }

    // ── Staff clicks Approve/Deny → open the optional-note modal ─────────────
    if (interaction.isButton() && parsed.action === 'decide') {
      const [status, submissionId] = parsed.args;
      if (!status || !isDecision(status) || !submissionId) return;
      const config = await getApplicationsConfig(interaction.guildId);
      if (!canReview(interaction.member, config.staffRoleIds)) {
        await interaction.reply({
          embeds: [errorEmbed('You don’t have permission to review applications.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`apply:done:${status}:${submissionId}`)
        .setTitle(status === 'APPROVED' ? 'Approve application' : 'Deny application')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('note')
              .setLabel('Message to applicant (optional)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(1000),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    // ── Member submits a filled-in form ─────────────────────────────────────
    if (interaction.isModalSubmit() && parsed.action === 'submit') {
      if (!(await ctx.config.isEnabled(interaction.guildId, 'APPLICATIONS'))) {
        await interaction.reply({
          embeds: [errorEmbed('Applications are disabled on this server.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const form = await getFormById(parsed.args[0] ?? '');
      if (!form || form.guildId !== interaction.guildId || !form.enabled) {
        await interaction.reply({
          embeds: [errorEmbed('That application form is no longer available.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await recordSubmission(
        {
          guildId: interaction.guildId,
          form,
          applicantId: interaction.user.id,
          applicantTag: interaction.user.tag,
          answers: readModalAnswers(interaction, form),
        },
        deps,
      );
      await interaction.editReply(
        'error' in result
          ? { embeds: [errorEmbed(result.error)] }
          : { embeds: [successEmbed('Your application has been submitted. Thanks!')] },
      );
      return;
    }

    // ── Staff confirms the decision (note modal submit) ──────────────────────
    if (interaction.isModalSubmit() && parsed.action === 'done') {
      const [status, submissionId] = parsed.args;
      if (!status || !isDecision(status) || !submissionId) return;
      const config = await getApplicationsConfig(interaction.guildId);
      if (!canReview(interaction.member, config.staffRoleIds)) {
        await interaction.reply({
          embeds: [errorEmbed('You don’t have permission to review applications.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const note = modalFieldValue(interaction, 'note') || null;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await decideApplication(
        { submissionId, reviewerId: interaction.user.id, status, note },
        deps,
      );
      await interaction.editReply(
        'error' in result
          ? { embeds: [errorEmbed(result.error)] }
          : {
              embeds: [
                successEmbed(
                  `Application ${status === 'APPROVED' ? 'approved' : 'denied'} — <@${result.applicantId}> has been notified.`,
                ),
              ],
            },
      );
      return;
    }
  },
});
