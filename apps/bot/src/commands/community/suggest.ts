import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import { createSuggestion, getSuggestionsConfig } from '../../modules/suggestions';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion.')
    .addStringOption((o) =>
      o.setName('text').setDescription('Your suggestion').setRequired(true).setMaxLength(1500),
    ),
  module: 'SUGGESTIONS',
  preconditions: [RequireGuild],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const config = await getSuggestionsConfig(interaction.guildId);
    if (!config.channelId) {
      await interaction.reply({
        embeds: [errorEmbed('Suggestions aren’t configured on this server yet.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const text = interaction.options.getString('text', true).slice(0, 1500);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const number = await createSuggestion(
      interaction.guildId,
      config.channelId,
      interaction.user.id,
      text,
      config.anonymous,
      { client: ctx.client, logger: ctx.logger },
    );
    await interaction.editReply({
      embeds: [successEmbed(number ? `Suggestion #${number} submitted.` : 'Suggestion submitted.')],
    });
  },
};

export default command;
