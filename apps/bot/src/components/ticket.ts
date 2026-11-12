import { MessageFlags, type GuildMember } from 'discord.js';
import { prisma, type Ticket } from '@refx/database';
import type { TicketsConfig } from '@refx/shared';
import { brandedEmbed, errorEmbed, successEmbed } from '../lib/embeds';
import { defineComponent, type RoutedInteraction } from '../framework/component';
import type { BotContext } from '../framework/context';
import {
  buildCloseForm,
  buildCloseRequestMessage,
  buildTicketForm,
  buildTicketPanelMessage,
  checkCanOpen,
  closeTicket,
  deleteTicket,
  exportTranscript,
  getTicketsConfig,
  isTicketStaff,
  openTicket,
  reopenTicket,
  setTicketClaim,
  shouldAnnounceCloseRequest,
  type TicketAnswer,
  type TicketDeps,
} from '../modules/tickets';

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

async function refuse(interaction: RoutedInteraction, message: string): Promise<void> {
  const payload = { embeds: [errorEmbed(message)] };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => undefined);
  } else {
    await interaction.reply({ ...payload, ...ephemeral }).catch(() => undefined);
  }
}

/** The ticket this interaction was used in, with the settings and whether the user is staff. */
async function ticketContext(
  channelId: string,
  guildId: string,
  member: GuildMember,
): Promise<{ ticket: Ticket | null; config: TicketsConfig; staff: boolean }> {
  const [ticket, config] = await Promise.all([
    prisma.ticket.findUnique({ where: { channelId } }),
    getTicketsConfig(guildId),
  ]);
  return { ticket, config, staff: isTicketStaff(member, config, ticket?.typeId) };
}

/**
 * A member pressed a panel button or picked a type from the dropdown. Either
 * show the type's opening form, or open the ticket straight away.
 */
async function startOpening(
  interaction: RoutedInteraction,
  typeId: string | undefined,
  ctx: BotContext,
  deps: TicketDeps,
): Promise<void> {
  if (!interaction.inCachedGuild() || interaction.isModalSubmit()) return;
  if (!(await ctx.config.isEnabled(interaction.guildId, 'TICKETS'))) {
    await refuse(interaction, 'Tickets are switched off on this server.');
    return;
  }
  const check = await checkCanOpen(interaction.guild, interaction.user.id, typeId);
  if ('error' in check) {
    await refuse(interaction, check.error);
    return;
  }
  if (check.type.questions.length > 0) {
    // A form must be the first answer to the click, so nothing is deferred here.
    await interaction.showModal(buildTicketForm(check.type));
    return;
  }
  await interaction.deferReply(ephemeral);
  const result = await openTicket(interaction.guild, interaction.user, check.type.id, [], deps);
  if ('error' in result) await refuse(interaction, result.error);
  else await interaction.editReply({ content: `Your ticket is ready: <#${result.channelId}>` });
}

export default defineComponent({
  module: 'ticket',
  async handle(interaction, parsed, ctx) {
    if (!interaction.inCachedGuild()) return;
    const deps: TicketDeps = { client: ctx.client, jobs: ctx.jobs, logger: ctx.logger };
    const { guild, guildId, member, user, channelId } = interaction;
    if (!channelId) return;

    switch (parsed.action) {
      // ── Opening ────────────────────────────────────────────────────────────
      case 'open': {
        await startOpening(interaction, parsed.args[0], ctx, deps);
        return;
      }

      case 'pick': {
        if (!interaction.isStringSelectMenu()) return;
        const typeId = interaction.values[0];
        await startOpening(interaction, typeId, ctx, deps);
        // Put the dropdown back to its placeholder so the next person sees it unselected.
        const config = await getTicketsConfig(guildId);
        await interaction.message.edit(buildTicketPanelMessage(config)).catch(() => undefined);
        return;
      }

      case 'form': {
        if (!interaction.isModalSubmit()) return;
        await interaction.deferReply(ephemeral);
        if (!(await ctx.config.isEnabled(guildId, 'TICKETS'))) {
          await refuse(interaction, 'Tickets are switched off on this server.');
          return;
        }
        const check = await checkCanOpen(guild, user.id, parsed.args[0]);
        if ('error' in check) {
          await refuse(interaction, check.error);
          return;
        }
        const answers: TicketAnswer[] = [];
        check.type.questions.forEach((question, index) => {
          let answer = '';
          try {
            answer = interaction.fields.getTextInputValue(`q${index}`).trim();
          } catch {
            /* the form was built before this question was added */
          }
          if (answer) answers.push({ question: question.label, answer });
        });
        const result = await openTicket(guild, user, check.type.id, answers, deps);
        if ('error' in result) await refuse(interaction, result.error);
        else
          await interaction.editReply({ content: `Your ticket is ready: <#${result.channelId}>` });
        return;
      }

      // ── Closing ────────────────────────────────────────────────────────────
      case 'close': {
        if (interaction.isModalSubmit()) return;
        const { ticket, config, staff } = await ticketContext(channelId, guildId, member);
        if (!ticket || ticket.status !== 'OPEN') {
          await refuse(interaction, 'This ticket is already closed.');
          return;
        }
        if (!staff && config.staffOnlyClose) {
          const announce = shouldAnnounceCloseRequest(channelId);
          await interaction.reply({
            embeds: [
              brandedEmbed({
                description: announce
                  ? "Only staff can close tickets here. I've let them know you're finished."
                  : 'Staff have already been told you would like this ticket closed.',
              }),
            ],
            ...ephemeral,
          });
          if (announce && interaction.channel?.isSendable()) {
            await interaction.channel
              .send(buildCloseRequestMessage(user.id))
              .catch(() => undefined);
          }
          return;
        }
        // The form doubles as the confirmation: submitting closes, dismissing cancels.
        await interaction.showModal(buildCloseForm());
        return;
      }

      case 'closeform': {
        if (!interaction.isModalSubmit()) return;
        await interaction.deferReply(ephemeral);
        const { ticket, config, staff } = await ticketContext(channelId, guildId, member);
        if (!ticket || ticket.status !== 'OPEN') {
          await refuse(interaction, 'This ticket is already closed.');
          return;
        }
        if (!staff && config.staffOnlyClose) {
          await refuse(interaction, 'Only staff can close tickets here.');
          return;
        }
        const reason = interaction.fields.getTextInputValue('reason');
        const closed = await closeTicket(channelId, user.id, deps, reason);
        await interaction
          .editReply(
            closed
              ? { embeds: [successEmbed('Ticket closed.')] }
              : { embeds: [errorEmbed('This ticket was already closed.')] },
          )
          .catch(() => undefined);
        return;
      }

      // ── Staff buttons ──────────────────────────────────────────────────────
      case 'claim':
      case 'unclaim': {
        const { ticket, staff } = await ticketContext(channelId, guildId, member);
        if (!ticket || ticket.status !== 'OPEN') {
          await refuse(interaction, 'This ticket is closed.');
          return;
        }
        if (!staff) {
          await refuse(interaction, 'Only staff can claim tickets.');
          return;
        }
        if (parsed.action === 'claim') {
          if (ticket.claimedById) {
            await refuse(
              interaction,
              `This ticket is already being handled by <@${ticket.claimedById}>.`,
            );
            return;
          }
          await interaction.deferUpdate();
          await setTicketClaim(guild, ticket, user.id);
          if (interaction.channel?.isSendable()) {
            await interaction.channel
              .send({
                embeds: [
                  brandedEmbed({ description: `🙋 <@${user.id}> will be handling this ticket.` }),
                ],
                allowedMentions: { parse: [] },
              })
              .catch(() => undefined);
          }
          return;
        }
        const mayRelease = ticket.claimedById === user.id || member.permissions.has('ManageGuild');
        if (!mayRelease) {
          await refuse(
            interaction,
            `<@${ticket.claimedById}> is handling this ticket. They can unclaim it, or use \`/ticket transfer\`.`,
          );
          return;
        }
        await interaction.deferUpdate();
        await setTicketClaim(guild, ticket, null);
        return;
      }

      case 'reopen': {
        if (!interaction.isButton()) return;
        const { staff } = await ticketContext(channelId, guildId, member);
        if (!staff) {
          await refuse(interaction, 'Only staff can reopen tickets.');
          return;
        }
        await interaction.deferUpdate();
        const reopened = await reopenTicket(channelId, user.id, deps);
        if (reopened) {
          // The closed notice has done its job; its buttons no longer apply.
          await interaction.message.edit({ components: [] }).catch(() => undefined);
        } else {
          await interaction
            .followUp({ embeds: [errorEmbed('This ticket is not closed.')], ...ephemeral })
            .catch(() => undefined);
        }
        return;
      }

      case 'transcript': {
        const { staff } = await ticketContext(channelId, guildId, member);
        if (!staff) {
          await refuse(interaction, 'Only staff can save transcripts.');
          return;
        }
        await interaction.deferReply(ephemeral);
        const exported = await exportTranscript(channelId, deps);
        if (!exported) {
          await refuse(interaction, "I couldn't build a transcript for this channel.");
          return;
        }
        await interaction.editReply({
          content: exported.logged
            ? 'Here is the transcript. A copy was also posted in the transcript channel.'
            : 'Here is the transcript. (No transcript channel is set, so it was not posted anywhere else.)',
          files: [exported.file],
        });
        return;
      }

      case 'delete': {
        const { ticket, staff } = await ticketContext(channelId, guildId, member);
        if (!staff) {
          await refuse(interaction, 'Only staff can delete tickets.');
          return;
        }
        if (!ticket || ticket.status !== 'CLOSED') {
          await refuse(interaction, 'Close the ticket before deleting it.');
          return;
        }
        // Answer first: the reply can't be delivered once the channel is gone.
        await interaction
          .reply({ content: 'Deleting this ticket…', ...ephemeral })
          .catch(() => undefined);
        await deleteTicket(channelId, user.tag, deps);
        return;
      }

      default:
        return;
    }
  },
});
