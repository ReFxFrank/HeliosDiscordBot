import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { errorEmbed } from '../../lib/embeds';
import { nowPlayingEmbed } from '../../lib/music';

const command: Command = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show the track that is currently playing.'),
  module: 'MUSIC',
  preconditions: [RequireGuild, RequirePremium('MUSIC')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const player = ctx.music?.getPlayer(interaction.guildId);
    const current = player?.queue.current;
    if (!player || !current) {
      await interaction.reply({
        embeds: [errorEmbed('Nothing is playing right now.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({ embeds: [nowPlayingEmbed(current, player)] });
  },
};

export default command;
