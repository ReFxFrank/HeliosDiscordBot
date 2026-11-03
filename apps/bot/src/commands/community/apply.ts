import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { parseApplicationQuestions } from '@refx/shared';
import { errorEmbed } from '../../lib/embeds';
import { RequireGuild, Cooldown } from '../../lib/permissions';
import { buildApplicationModal, getEnabledForms } from '../../modules/applications';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Fill out one of this server’s application forms.')
    .addStringOption((o) =>
      o
        .setName('form')
        .setDescription('Which form to fill out')
        .setRequired(false)
        .setAutocomplete(true),
    ),
  module: 'APPLICATIONS',
  preconditions: [RequireGuild, Cooldown(10)],
  async autocomplete(interaction, ctx) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    // ctx unused beyond the guild scope, but kept for signature parity.
    void ctx;
    const forms = await getEnabledForms(interaction.guildId);
    const focused = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      forms
        .filter((form) => form.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((form) => ({ name: form.name.slice(0, 100), value: form.id })),
    );
  },
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    void ctx;
    const forms = await getEnabledForms(interaction.guildId);
    if (forms.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed('There are no application forms set up on this server yet.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Resolve the target form: by the autocomplete id, else the only form, else
    // ask the member to pick (a modal can only be opened for one form at a time).
    const input = interaction.options.getString('form');
    const form =
      (input &&
        forms.find((f) => f.id === input || f.name.toLowerCase() === input.toLowerCase())) ||
      (forms.length === 1 ? forms[0] : null);

    if (!form) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            `Pick a form to apply for:\n${forms.map((f) => `• **${f.name}**`).join('\n')}\n\nRun \`/apply\` again and choose one from the **form** option.`,
          ),
        ],
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
  },
};

export default command;
