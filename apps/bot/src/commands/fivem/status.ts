import { FEATURES } from '@refx/shared';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildStatusComponents, buildStatusEmbed, readSnapshot } from '../../modules/fivem';
import { errorEmbed } from '../../lib/embeds';
import { Cooldown, RequireGuild } from '../../lib/permissions';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Is the city up? Players online, connect info and the next restart.'),
  module: 'FIVEM',
  available: () => FEATURES.fivem,
  preconditions: [RequireGuild, Cooldown(5)],
  async execute(interaction, ctx) {
    const guildId = interaction.guildId!;
    const config = await ctx.config.getConfig(guildId, 'FIVEM');
    if (!config.host.trim()) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'The city server address isn’t set yet. Ask an admin to configure FiveM City in the dashboard.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const snapshot = await readSnapshot(ctx, guildId);
    await interaction.reply({
      embeds: [
        buildStatusEmbed(
          config,
          snapshot,
          interaction.guild?.iconURL({ extension: 'png', size: 256 }) ?? null,
        ),
      ],
      components: buildStatusComponents(config),
    });
  },
};

export default command;
