import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import { brandedEmbed, errorEmbed, successEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import { buildTicketPanelMessage, closeTicket, getTicketsConfig } from '../../modules/tickets';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage support tickets.')
    .addSubcommand((s) =>
      s
        .setName('panel')
        .setDescription('Deploy the "open a ticket" panel.')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel to post the panel in (defaults to here).')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) => s.setName('close').setDescription('Close the current ticket.'))
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a member to the current ticket.')
        .addUserOption((o) => o.setName('user').setDescription('Member to add').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove a member from the current ticket.')
        .addUserOption((o) =>
          o.setName('user').setDescription('Member to remove').setRequired(true),
        ),
    ),
  module: 'TICKETS',
  preconditions: [RequireGuild],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    const config = await getTicketsConfig(interaction.guildId);

    const isStaff =
      interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      config.supportRoleIds.some((id) => interaction.member.roles.cache.has(id));

    if (sub === 'panel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          embeds: [errorEmbed('You need Manage Server to deploy the panel.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const target = interaction.options.getChannel('channel') ?? interaction.channel;
      if (!target || target.type !== ChannelType.GuildText) {
        await interaction.reply({
          embeds: [errorEmbed('Pick a text channel for the panel.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await target.send(buildTicketPanelMessage(config)).catch(() => null);
      await interaction.reply({
        embeds: [successEmbed(`Panel deployed to ${target}.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // close / add / remove all operate on the current ticket channel.
    const ticket = await prisma.ticket.findUnique({
      where: { channelId: interaction.channelId },
    });
    if (!ticket || ticket.status !== 'OPEN') {
      await interaction.reply({
        embeds: [errorEmbed('Run this inside an open ticket channel.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'close') {
      await interaction.reply({
        embeds: [brandedEmbed({ description: 'Closing this ticket…' })],
        flags: MessageFlags.Ephemeral,
      });
      await closeTicket(
        interaction.channelId,
        interaction.user.id,
        ctx,
        `closed by ${interaction.user.tag}`,
      );
      return;
    }

    // add / remove require staff.
    if (!isStaff) {
      await interaction.reply({
        embeds: [errorEmbed('Only staff can add or remove ticket members.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const user = interaction.options.getUser('user', true);
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) return;

    if (sub === 'add') {
      await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await interaction.reply({ embeds: [successEmbed(`Added ${user} to the ticket.`)] });
    } else {
      await channel.permissionOverwrites.delete(user.id).catch(() => undefined);
      await interaction.reply({ embeds: [successEmbed(`Removed ${user} from the ticket.`)] });
    }
  },
};

export default command;
