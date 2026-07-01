import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { isController } from '../../lib/music';

const command: Command = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume a paused track.'),
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

    const config = await ctx.config.getConfig(interaction.guildId, 'MUSIC');
    if (!isController(interaction.member, config)) {
      await interaction.reply({
        embeds: [errorEmbed('Only DJs can resume playback.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!player.paused) {
      await interaction.reply({
        embeds: [brandedEmbed({ kind: 'warning', description: 'Playback is not paused.' })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await player.resume();
    await interaction.reply({ embeds: [brandedEmbed({ kind: 'success', description: '▶️ Resumed.' })] });
  },
};

export default command;
