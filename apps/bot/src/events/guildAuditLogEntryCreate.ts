import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { handleAuditEntryForAntiNuke } from '../modules/antiNuke';

// Requires the bot to hold View Audit Log in the guild; Discord simply doesn't
// deliver the event otherwise, so anti-nuke silently needs that permission.
export default defineEvent({
  name: Events.GuildAuditLogEntryCreate,
  async execute(ctx, entry, guild) {
    await handleAuditEntryForAntiNuke(entry, guild, ctx);
  },
});
