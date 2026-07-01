import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { RepeatMode } from 'lavalink-client';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { isController } from '../../lib/music';

const LABEL: Record<RepeatMode, string> = {
  off: '➡️ Looping disabled.',
  track: '🔂 Looping the current track.',
  queue: '🔁 Looping the queue.',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the loop mode.')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('What to loop')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Track', value: 'track' },
          { name: 'Queue', value: 'queue' },
        ),
    ),
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
        embeds: [errorEmbed('Only DJs can change the loop mode.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const mode = interaction.options.getString('mode', true) as RepeatMode;
    await player.setRepeatMode(mode);
    await interaction.reply({ embeds: [brandedEmbed({ kind: 'success', description: LABEL[mode] })] });
  },
};

export default command;
