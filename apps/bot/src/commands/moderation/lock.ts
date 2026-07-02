import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { brandedEmbed, errorEmbed, successEmbed } from '../../lib/embeds';
import { RequireGuild, RequireUserPermissions } from '../../lib/permissions';
import { postModLog } from '../../lib/moderation';
import { botCanLockdown, lockChannel } from '../../modules/lockdown';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel so members can’t send messages.')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel to lock (defaults to here)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((o) => o.setName('reason').setDescription('Why the channel is being locked'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  module: 'MODERATION',
  preconditions: [RequireGuild, RequireUserPermissions(PermissionFlagsBits.ManageChannels)],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    if (!botCanLockdown(interaction.guild)) {
      await interaction.reply({
        embeds: [errorEmbed('I need the **Manage Roles** permission to lock channels.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const target = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason');
    if (!target) {
      await interaction.reply({
        embeds: [errorEmbed('Pick a channel to lock.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await lockChannel(target, interaction.user.id, reason);
    if (result === 'locked') {
      const embed = brandedEmbed({
        kind: 'danger',
        title: '🔒 Channel locked',
        description: [
          `**Channel:** <#${target.id}>`,
          `**Moderator:** ${interaction.user.tag}`,
          reason ? `**Reason:** ${reason}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      });
      await interaction.reply({ embeds: [successEmbed(`Locked <#${target.id}>.`)], flags: MessageFlags.Ephemeral });
      const config = await ctx.config.getConfig(interaction.guildId, 'MODERATION');
      await postModLog(ctx, interaction.guildId, config, embed);
      return;
    }

    const message: Record<Exclude<typeof result, 'locked'>, string> = {
      already: 'That channel is already locked.',
      noperm: 'I can’t manage permissions there — check my Manage Roles and channel access.',
      failed: 'I couldn’t lock that channel. Check my permissions and try again.',
      unsupported: 'You can only lock text or announcement channels.',
    };
    await interaction.reply({
      embeds: [brandedEmbed({ kind: 'warning', description: message[result] })],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
