import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import { setAfk } from '../../modules/afk';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set yourself AFK; cleared automatically on your next message.')
    .addStringOption((o) =>
      o.setName('reason').setDescription('Optional AFK reason').setMaxLength(200),
    ),
  module: 'AFK',
  preconditions: [RequireGuild],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const reason = interaction.options.getString('reason')?.slice(0, 200) ?? null;
    await setAfk(interaction.guildId, interaction.user.id, reason);
    await interaction.reply({
      embeds: [successEmbed(reason ? `You're now AFK: ${reason}` : "You're now AFK.")],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
