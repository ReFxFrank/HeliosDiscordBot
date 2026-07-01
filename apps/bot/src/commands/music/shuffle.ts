import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { isController } from '../../lib/music';

const command: Command = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue.'),
  module: 'MUSIC',
  preconditions: [RequireGuild, RequirePremium('MUSIC')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const player = ctx.music?.getPlayer(interaction.guildId);
    if (!player || player.queue.tracks.length < 2) {
      await interaction.reply({
        embeds: [errorEmbed('There aren’t enough tracks in the queue to shuffle.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await ctx.config.getConfig(interaction.guildId, 'MUSIC');
    if (!isController(interaction.member, config)) {
      await interaction.reply({
        embeds: [errorEmbed('Only DJs can shuffle the queue.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await player.queue.shuffle();
    await interaction.reply({ embeds: [brandedEmbed({ kind: 'success', description: '🔀 Shuffled the queue.' })] });
  },
};

export default command;
