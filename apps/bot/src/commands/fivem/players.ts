import { FEATURES } from '@refx/shared';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildPlayersEmbed, readSnapshot } from '../../modules/fivem';
import { Cooldown, RequireGuild } from '../../lib/permissions';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder().setName('players').setDescription('Who’s in the city right now.'),
  module: 'FIVEM',
  available: () => FEATURES.fivem,
  preconditions: [RequireGuild, Cooldown(5)],
  async execute(interaction, ctx) {
    const guildId = interaction.guildId!;
    const config = await ctx.config.getConfig(guildId, 'FIVEM');
    const snapshot = await readSnapshot(ctx, guildId);
    await interaction.reply({
      embeds: [buildPlayersEmbed(config, snapshot)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
