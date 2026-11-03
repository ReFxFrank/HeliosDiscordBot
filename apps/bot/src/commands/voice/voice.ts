import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { isTempChannel, ownerOfTempChannel } from '../../modules/tempVoice';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Manage your temp voice channel.')
    .addSubcommand((s) =>
      s
        .setName('name')
        .setDescription('Rename your channel.')
        .addStringOption((o) =>
          o.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(100),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('limit')
        .setDescription('Set a user limit (0 = unlimited).')
        .addIntegerOption((o) =>
          o
            .setName('limit')
            .setDescription('0–99')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(99),
        ),
    )
    .addSubcommand((s) => s.setName('lock').setDescription('Stop others from joining.'))
    .addSubcommand((s) => s.setName('unlock').setDescription('Allow others to join again.')),
  module: 'TEMP_VOICE',
  preconditions: [RequireGuild],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;

    const channel = interaction.member.voice.channel;
    if (!channel || !isTempChannel(channel.id)) {
      await interaction.reply({
        embeds: [errorEmbed('You must be in your temp voice channel to use this.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (ownerOfTempChannel(channel.id) !== interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed('Only the channel owner can manage it.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    let description: string;

    if (sub === 'name') {
      const name = interaction.options.getString('name', true).slice(0, 100);
      await channel.setName(name);
      description = `✏️ Renamed your channel to **${name}**.`;
    } else if (sub === 'limit') {
      const limit = interaction.options.getInteger('limit', true);
      await channel.setUserLimit(limit);
      description =
        limit === 0 ? '👥 Removed the user limit.' : `👥 User limit set to **${limit}**.`;
    } else {
      const locked = sub === 'lock';
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        Connect: locked ? false : null,
      });
      // Keep the owner able to leave and rejoin their own locked channel.
      await channel.permissionOverwrites.edit(interaction.user.id, {
        Connect: locked ? true : null,
      });
      description = locked ? '🔒 Locked — others can’t join.' : '🔓 Unlocked — others can join.';
    }

    await interaction.reply({
      embeds: [brandedEmbed({ kind: 'success', description })],
      flags: MessageFlags.Ephemeral,
    });
    ctx.logger.debug({ sub, channelId: channel.id }, 'Temp voice control used');
  },
};

export default command;
