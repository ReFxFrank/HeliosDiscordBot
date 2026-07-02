import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { brandedEmbed, successEmbed } from '../../lib/embeds';
import { RequireGuild, RequireUserPermissions } from '../../lib/permissions';
import { postModLog } from '../../lib/moderation';
import { unlockChannel } from '../../modules/lockdown';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel that was locked.')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel to unlock (defaults to here)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  module: 'MODERATION',
  preconditions: [RequireGuild, RequireUserPermissions(PermissionFlagsBits.ManageChannels)],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!target) {
      await interaction.reply({
        embeds: [brandedEmbed({ kind: 'warning', description: 'Pick a channel to unlock.' })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await unlockChannel(interaction.guild, target.id);
    if (result === 'notlocked') {
      await interaction.reply({
        embeds: [brandedEmbed({ kind: 'info', description: `<#${target.id}> isn’t locked.` })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [successEmbed(`Unlocked <#${target.id}>.`)],
      flags: MessageFlags.Ephemeral,
    });
    const config = await ctx.config.getConfig(interaction.guildId, 'MODERATION');
    await postModLog(
      ctx,
      interaction.guildId,
      config,
      brandedEmbed({
        kind: 'success',
        title: '🔓 Channel unlocked',
        description: `**Channel:** <#${target.id}>\n**Moderator:** ${interaction.user.tag}`,
      }),
    );
  },
};

export default command;
