import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { errorEmbed } from '../../lib/embeds';
import { queueEmbed } from '../../lib/music';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue.')
    .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
  module: 'MUSIC',
  preconditions: [RequireGuild, RequirePremium('MUSIC')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const player = ctx.music?.getPlayer(interaction.guildId);
    if (!player?.queue.current) {
      await interaction.reply({
        embeds: [errorEmbed('Nothing is playing right now.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const page = interaction.options.getInteger('page') ?? 1;
    await interaction.reply({ embeds: [queueEmbed(player, page)] });
  },
};

export default command;
