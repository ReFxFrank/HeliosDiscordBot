import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { isController } from '../../lib/music';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue, and leave the voice channel.'),
  module: 'MUSIC',
  preconditions: [RequireGuild, RequirePremium('MUSIC')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const player = ctx.music?.getPlayer(interaction.guildId);
    if (!player) {
      await interaction.reply({
        embeds: [errorEmbed('Nothing is playing right now.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await ctx.config.getConfig(interaction.guildId, 'MUSIC');
    if (!isController(interaction.member, config)) {
      await interaction.reply({
        embeds: [errorEmbed('Only DJs can stop playback.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await player.destroy('Stopped by user');
    await interaction.reply({ embeds: [brandedEmbed({ kind: 'success', description: '⏹️ Stopped and left the channel.' })] });
  },
};

export default command;
