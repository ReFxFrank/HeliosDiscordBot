import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { addSkipVote, clearSkipVotes, humanListeners, isController, votesNeeded } from '../../lib/music';

const command: Command = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track (vote-skip if you are not a DJ).'),
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

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel || voiceChannel.id !== player.voiceChannelId) {
      await interaction.reply({
        embeds: [errorEmbed('Join my voice channel to skip.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await ctx.config.getConfig(interaction.guildId, 'MUSIC');
    const title = player.queue.current.info.title;

    // DJs/mods (or open control) skip instantly.
    if (isController(interaction.member, config)) {
      clearSkipVotes(interaction.guildId);
      await player.skip(undefined, false);
      await interaction.reply({ embeds: [brandedEmbed({ kind: 'success', description: `⏭️ Skipped **${title}**.` })] });
      return;
    }

    const needed = votesNeeded(humanListeners(voiceChannel), config.voteSkipRatio);
    const votes = addSkipVote(interaction.guildId, interaction.user.id);
    if (votes >= needed) {
      clearSkipVotes(interaction.guildId);
      await player.skip(undefined, false);
      await interaction.reply({ embeds: [brandedEmbed({ kind: 'success', description: `⏭️ Vote passed — skipped **${title}**.` })] });
      return;
    }

    await interaction.reply({
      embeds: [brandedEmbed({ kind: 'info', description: `🗳️ Vote to skip: **${votes}/${needed}**` })],
    });
  },
};

export default command;
