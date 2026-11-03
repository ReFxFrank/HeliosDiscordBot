import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { brandedEmbed } from '../lib/embeds';
import { sendLog } from '../lib/logging';
import { findMessageDeleter } from '../lib/auditLookup';

export default defineEvent({
  name: Events.MessageDelete,
  async execute(ctx, message) {
    if (!message.guild) return;
    const { executor, target } = await findMessageDeleter(
      message.guild,
      message.channelId,
      message.author?.id ?? null,
    );
    // The audit log names the author even when the message wasn't cached.
    const author = message.author ?? target;
    // A bot tidying up its own messages is noise; a person deleting a bot's
    // message (a panel, an embed) is worth logging.
    if (author?.bot && (!executor || executor.id === author.id)) return;

    let deletedBy: string;
    if (executor && executor.id !== author?.id) deletedBy = `<@${executor.id}>`;
    // Discord's audit log records neither self-deletes nor deletes done by bots.
    else if (author) deletedBy = `<@${author.id}> themselves, or a bot`;
    else deletedBy = 'The author or a bot (not in the audit log)';

    const embed = brandedEmbed({ kind: 'danger', title: 'Message deleted' })
      .setDescription(message.content?.slice(0, 1024) || '*content not cached*')
      .addFields(
        { name: 'Author', value: author ? `<@${author.id}>` : 'Unknown', inline: true },
        { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
        { name: 'Deleted by', value: deletedBy, inline: true },
      );
    await sendLog(ctx, message.guild.id, 'message', embed, {
      channelId: message.channelId,
      userId: author?.id ?? null,
    });
  },
});
