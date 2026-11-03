import type { Client } from 'discord.js';
import { prisma } from '@refx/database';
import { brandedEmbed } from '../lib/embeds';
import type { Logger } from '../logger';

export interface ReminderDeps {
  client: Client;
  logger: Logger;
}

/**
 * Deliver a reminder, then remove it (one-shot). Best-effort: posts in the
 * origin channel mentioning the user, falling back to a DM. Delivery failures
 * are swallowed so the durable job completes and isn't retried forever — a
 * reminder whose channel/user vanished can never be delivered.
 */
export async function fireReminder(reminderId: string, deps: ReminderDeps): Promise<void> {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder) return;

  const embed = brandedEmbed({ kind: 'info', title: '⏰ Reminder', description: reminder.content });

  let delivered = false;
  const guild = deps.client.guilds.cache.get(reminder.guildId);
  const channel =
    guild?.channels.cache.get(reminder.channelId) ??
    (await guild?.channels.fetch(reminder.channelId).catch(() => null));
  if (channel && channel.isTextBased() && !channel.isDMBased()) {
    const sent = await channel
      .send({
        content: `<@${reminder.userId}>`,
        embeds: [embed],
        allowedMentions: { users: [reminder.userId] },
      })
      .catch(() => null);
    delivered = sent !== null;
  }

  if (!delivered) {
    const user = await deps.client.users.fetch(reminder.userId).catch(() => null);
    await user?.send({ embeds: [embed] }).catch(() => undefined);
  }

  await prisma.reminder.delete({ where: { id: reminderId } }).catch(() => undefined);
}
