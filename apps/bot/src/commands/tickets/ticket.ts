import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@refx/database';
import { findTicketType, listTicketTypes, renderTicketChannelName } from '@refx/shared';
import { brandedEmbed, errorEmbed, successEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import {
  closeTicket,
  deleteTicket,
  deployTicketPanel,
  getTicketsConfig,
  isTicketStaff,
  moveTicket,
  reopenTicket,
  setTicketBlocked,
  setTicketClaim,
} from '../../modules/tickets';
import type { Command } from '../../framework/command';

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

async function refuse(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
  const payload = { embeds: [errorEmbed(message)] };
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply({ ...payload, ...ephemeral });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage support tickets.')
    .addSubcommand((s) =>
      s
        .setName('panel')
        .setDescription('Post the "open a ticket" panel, or update the one already there.')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel to post the panel in (defaults to here).')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('close')
        .setDescription('Close the current ticket.')
        .addStringOption((o) =>
          o
            .setName('reason')
            .setDescription('Why it is being closed. Shown in the log and sent to the member.')
            .setMaxLength(500),
        ),
    )
    .addSubcommand((s) => s.setName('reopen').setDescription('Reopen this closed ticket.'))
    .addSubcommand((s) =>
      s.setName('delete').setDescription('Delete this closed ticket channel for good.'),
    )
    .addSubcommand((s) => s.setName('claim').setDescription('Take this ticket as yours to handle.'))
    .addSubcommand((s) => s.setName('unclaim').setDescription('Release this ticket.'))
    .addSubcommand((s) =>
      s
        .setName('transfer')
        .setDescription('Hand this ticket to another staff member.')
        .addUserOption((o) =>
          o.setName('staff').setDescription('Who should handle it').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('move')
        .setDescription('Move this ticket to another ticket type.')
        .addStringOption((o) =>
          o.setName('type').setDescription('Ticket type').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('rename')
        .setDescription('Rename this ticket channel.')
        .addStringOption((o) =>
          o.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(60),
        ),
    )
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
    )
    .addSubcommand((s) =>
      s
        .setName('block')
        .setDescription('Stop a member from opening tickets.')
        .addUserOption((o) =>
          o.setName('user').setDescription('Member to block').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('unblock')
        .setDescription('Let a blocked member open tickets again.')
        .addUserOption((o) =>
          o.setName('user').setDescription('Member to unblock').setRequired(true),
        ),
    ),
  module: 'TICKETS',
  preconditions: [RequireGuild],

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;
    const config = await getTicketsConfig(interaction.guildId);
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      listTicketTypes(config)
        .filter((type) => type.label.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((type) => ({ name: type.label.slice(0, 100), value: type.id })),
    );
  },

  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    const config = await getTicketsConfig(interaction.guildId);
    const { guild, member, user } = interaction;
    const deps = { client: ctx.client, jobs: ctx.jobs, logger: ctx.logger };

    // ── Commands that work anywhere ──────────────────────────────────────────
    if (sub === 'panel') {
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await refuse(interaction, 'You need Manage Server to post the ticket panel.');
        return;
      }
      const target = interaction.options.getChannel('channel') ?? interaction.channel;
      if (!target || target.type !== ChannelType.GuildText) {
        await refuse(interaction, 'Pick a text channel for the panel.');
        return;
      }
      await interaction.deferReply(ephemeral);
      const result = await deployTicketPanel(guild, target.id, ctx.logger);
      if (!result.ok) {
        await refuse(interaction, result.error ?? 'The panel could not be posted.');
        return;
      }
      await interaction.editReply({
        embeds: [
          successEmbed(
            result.warnings?.length
              ? `The panel in ${target} was updated.`
              : `Panel posted in ${target}.`,
          ),
        ],
      });
      return;
    }

    if (sub === 'block' || sub === 'unblock') {
      if (!isTicketStaff(member, config, null)) {
        await refuse(interaction, 'Only ticket staff can change the block list.');
        return;
      }
      const target = interaction.options.getUser('user', true);
      const outcome = await setTicketBlocked(guild.id, target.id, sub === 'block');
      if (outcome === 'full') {
        await refuse(interaction, 'The block list is full. Unblock someone first.');
        return;
      }
      const message =
        outcome === 'unchanged'
          ? sub === 'block'
            ? `${target} is already blocked from opening tickets.`
            : `${target} is not blocked.`
          : sub === 'block'
            ? `${target} can no longer open tickets.`
            : `${target} can open tickets again.`;
      await interaction.reply({ embeds: [successEmbed(message)], ...ephemeral });
      return;
    }

    // ── Everything else acts on the ticket this channel belongs to ───────────
    const ticket = await prisma.ticket.findUnique({ where: { channelId: interaction.channelId } });
    if (!ticket || ticket.deletedAt) {
      await refuse(interaction, 'Run this inside a ticket channel.');
      return;
    }
    const staff = isTicketStaff(member, config, ticket.typeId);
    const open = ticket.status === 'OPEN';

    if (sub === 'close') {
      if (!open) {
        await refuse(interaction, 'This ticket is already closed.');
        return;
      }
      if (!staff && config.staffOnlyClose) {
        await refuse(
          interaction,
          'Only staff can close tickets here. Press Close on the ticket to let them know you are finished.',
        );
        return;
      }
      await interaction.deferReply(ephemeral);
      await closeTicket(ticket.channelId, user.id, deps, interaction.options.getString('reason'));
      await interaction.editReply({ embeds: [successEmbed('Ticket closed.')] });
      return;
    }

    // From here on, staff only.
    if (!staff) {
      await refuse(interaction, 'Only ticket staff can do that.');
      return;
    }

    if (sub === 'reopen') {
      if (open) {
        await refuse(interaction, 'This ticket is already open.');
        return;
      }
      await interaction.deferReply(ephemeral);
      await reopenTicket(ticket.channelId, user.id, deps);
      await interaction.editReply({ embeds: [successEmbed('Ticket reopened.')] });
      return;
    }

    if (sub === 'delete') {
      if (open) {
        await refuse(interaction, 'Close the ticket first, then delete it.');
        return;
      }
      // Answer first: the reply can't be delivered once the channel is gone.
      await interaction.reply({ content: 'Deleting this ticket…', ...ephemeral });
      await deleteTicket(ticket.channelId, user.tag, deps);
      return;
    }

    if (sub === 'rename') {
      const channel = interaction.channel;
      if (!channel || channel.type !== ChannelType.GuildText) return;
      // Reuse the name cleaner so the result is always something Discord accepts.
      const name = renderTicketChannelName(interaction.options.getString('name', true), {
        number: ticket.number,
        username: user.username,
        type: ticket.typeLabel ?? 'ticket',
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            `Renaming this channel to **${name}**. Discord allows two renames every ten minutes, so it can take a while to show if it was renamed recently.`,
          ),
        ],
        ...ephemeral,
      });
      void channel.setName(name).catch(() => undefined);
      return;
    }

    // The remaining commands only make sense while the ticket is open.
    if (!open) {
      await refuse(interaction, 'This ticket is closed. Reopen it first.');
      return;
    }

    if (sub === 'claim') {
      if (ticket.claimedById) {
        await refuse(
          interaction,
          `This ticket is already being handled by <@${ticket.claimedById}>.`,
        );
        return;
      }
      await setTicketClaim(guild, ticket, user.id);
      await interaction.reply({
        embeds: [brandedEmbed({ description: `🙋 ${user} will be handling this ticket.` })],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === 'unclaim') {
      if (!ticket.claimedById) {
        await refuse(interaction, 'Nobody has claimed this ticket.');
        return;
      }
      if (
        ticket.claimedById !== user.id &&
        !member.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        await refuse(
          interaction,
          `<@${ticket.claimedById}> is handling this ticket. They can unclaim it, or use \`/ticket transfer\`.`,
        );
        return;
      }
      await setTicketClaim(guild, ticket, null);
      await interaction.reply({
        embeds: [brandedEmbed({ description: 'This ticket is no longer claimed.' })],
      });
      return;
    }

    if (sub === 'transfer') {
      const target = interaction.options.getMember('staff');
      if (!target || target.user.bot) {
        await refuse(interaction, 'Pick a staff member who is in this server.');
        return;
      }
      if (!isTicketStaff(target, config, ticket.typeId)) {
        await refuse(interaction, `${target} is not ticket staff, so they can't take this ticket.`);
        return;
      }
      await setTicketClaim(guild, ticket, target.id);
      await interaction.reply({
        content: `${target}`,
        embeds: [brandedEmbed({ description: `${user} handed this ticket to ${target}.` })],
        allowedMentions: { users: [target.id] },
      });
      return;
    }

    if (sub === 'move') {
      const type = findTicketType(config, interaction.options.getString('type', true));
      if (!type || config.types.length === 0) {
        await refuse(
          interaction,
          'That ticket type does not exist. Pick one from the list (types are set up on the dashboard).',
        );
        return;
      }
      if (type.id === ticket.typeId) {
        await refuse(interaction, `This is already a "${type.label}" ticket.`);
        return;
      }
      await interaction.deferReply();
      const problem = await moveTicket(guild, ticket, type, config);
      if (problem) {
        await refuse(interaction, problem);
        return;
      }
      await interaction.editReply({
        embeds: [brandedEmbed({ description: `${user} moved this ticket to **${type.label}**.` })],
      });
      return;
    }

    // add / remove a member
    const target = interaction.options.getUser('user', true);
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) return;

    if (sub === 'add') {
      await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });
      await interaction.reply({ embeds: [successEmbed(`Added ${target} to the ticket.`)] });
      return;
    }
    if (sub === 'remove') {
      if (target.id === ticket.openerId) {
        await refuse(interaction, 'That is the member who opened the ticket. Close it instead.');
        return;
      }
      await channel.permissionOverwrites.delete(target.id).catch(() => undefined);
      await interaction.reply({ embeds: [successEmbed(`Removed ${target} from the ticket.`)] });
    }
  },
};

export default command;
