import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { brandedEmbed } from '../lib/embeds';
import { sendLog } from '../lib/logging';
import { findBulkDeleter } from '../lib/auditLookup';

export default defineEvent({
  name: Events.MessageBulkDelete,
  async execute(ctx, messages, channel) {
    if (channel.isDMBased()) return;
    const executor = await findBulkDeleter(channel.guild, channel.id);
    const embed = brandedEmbed({
      kind: 'danger',
      title: 'Bulk message delete',
      description: `**${messages.size}** messages deleted in <#${channel.id}>`,
    }).addFields({ name: 'Deleted by', value: executor ? `<@${executor.id}>` : 'Unknown' });
    await sendLog(ctx, channel.guild.id, 'message', embed, {
      channelId: channel.id,
      userId: executor?.id ?? null,
    });
  },
});
