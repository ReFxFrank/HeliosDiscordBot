import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { SuggestionStatus } from '@helios/database';
import { successEmbed, errorEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import { getSuggestionsConfig, setSuggestionStatus } from '../../modules/suggestions';
import type { Command } from '../../framework/command';

const STATUS_BY_SUB: Record<string, SuggestionStatus> = {
  approve: 'APPROVED',
  deny: 'DENIED',
  implement: 'IMPLEMENTED',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Triage suggestions (staff).')
    .addSubcommand((s) => addAction(s, 'approve', 'Approve a suggestion.'))
    .addSubcommand((s) => addAction(s, 'deny', 'Deny a suggestion.'))
    .addSubcommand((s) => addAction(s, 'implement', 'Mark a suggestion implemented.')),
  module: 'SUGGESTIONS',
  preconditions: [RequireGuild],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const config = await getSuggestionsConfig(interaction.guildId);
    const isStaff =
      interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      config.staffRoleIds.some((id) => interaction.member.roles.cache.has(id));
    if (!isStaff) {
      await interaction.reply({
        embeds: [errorEmbed('You don’t have permission to triage suggestions.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const status = STATUS_BY_SUB[sub];
    if (!status) return;
    const number = interaction.options.getInteger('number', true);
    const reason = interaction.options.getString('reason')?.slice(0, 500) ?? null;

    const ok = await setSuggestionStatus(
      interaction.guildId,
      number,
      status,
      interaction.user.id,
      reason,
      { client: ctx.client, logger: ctx.logger },
    );
    await interaction.reply({
      embeds: [
        ok
          ? successEmbed(`Suggestion #${number} → ${status.toLowerCase()}.`)
          : errorEmbed(`No suggestion #${number}.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

function addAction(
  builder: SlashCommandSubcommandBuilder,
  name: string,
  description: string,
): SlashCommandSubcommandBuilder {
  return builder
    .setName(name)
    .setDescription(description)
    .addIntegerOption((o) =>
      o.setName('number').setDescription('Suggestion number').setRequired(true).setMinValue(1),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Optional reason').setMaxLength(500),
    );
}

export default command;
