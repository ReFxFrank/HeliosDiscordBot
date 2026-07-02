import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';

export default defineEvent({
  name: Events.GuildDelete,
  async execute(ctx, guild) {
    // Keep the row (and its config/cases) so settings survive a re-invite, but
    // stamp the departure — the dashboard hides leftAt guilds from Configure.
    // updateMany so a missing row is a no-op instead of a throw.
    await ctx.prisma.guild.updateMany({
      where: { id: guild.id },
      data: { leftAt: new Date() },
    });
    ctx.logger.info({ guildId: guild.id }, 'Removed from guild (data retained)');
  },
});
