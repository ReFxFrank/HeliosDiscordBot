import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { handleMessageXp } from '../modules/leveling';
import { isTicketChannel, touchTicket } from '../modules/tickets';
import { handleCustomCommandsMessage } from '../modules/customCommands';
import { handleAfkMessage } from '../modules/afk';

export default defineEvent({
  name: Events.MessageCreate,
  async execute(ctx, message) {
    await handleMessageXp(message, ctx);

    if (message.author.bot || !message.inGuild()) return;

    if (isTicketChannel(message.channelId)) {
      await touchTicket(message.channelId, {
        client: ctx.client,
        jobs: ctx.jobs,
        logger: ctx.logger,
      });
    }

    if (await ctx.config.isEnabled(message.guildId, 'CUSTOM_COMMANDS')) {
      const config = await ctx.config.getConfig(message.guildId, 'CUSTOM_COMMANDS');
      await handleCustomCommandsMessage(message, config);
    }

    if (await ctx.config.isEnabled(message.guildId, 'AFK')) {
      await handleAfkMessage(message);
    }
  },
});
