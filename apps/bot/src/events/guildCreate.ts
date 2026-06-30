import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { upsertGuildMeta } from '../lib/guildSync';
import { cacheGuildInvites } from '../modules/inviteTracking';

export default defineEvent({
  name: Events.GuildCreate,
  async execute(ctx, guild) {
    await upsertGuildMeta(guild);
    await cacheGuildInvites(guild);
    ctx.logger.info({ guildId: guild.id, name: guild.name }, 'Joined / synced guild');
  },
});
