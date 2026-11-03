import type { BaseMessageOptions, Message } from 'discord.js';
import { prisma } from '@refx/database';
import {
  embedSpecSchema,
  matchAutoResponder,
  type AutoResponder,
  type CustomCommandsConfig,
} from '@refx/shared';
import { applyPlaceholders, type PlaceholderMember } from '../lib/placeholders';
import { buildEmbedFromSpec } from '../lib/embedSpec';

export interface CustomCommandRow {
  id: string;
  content: string | null;
  embed: unknown;
}

function placeholderMemberFromMessage(message: Message<true>): PlaceholderMember {
  return {
    user: {
      id: message.author.id,
      tag: message.author.tag,
      username: message.author.username,
      createdTimestamp: message.author.createdTimestamp,
    },
    guild: { name: message.guild.name, memberCount: message.guild.memberCount },
  };
}

/**
 * Build the message body for a tag. Text and embed strings are run through
 * `transform` (placeholders). Mentions are restricted to users so a tag can
 * never @everyone/@here or mass-ping roles.
 */
export function renderCustomCommand(
  command: CustomCommandRow,
  transform: (value: string) => string = (value) => value,
): BaseMessageOptions {
  const content = command.content ? transform(command.content).slice(0, 2000) : undefined;
  let embed = null;
  if (command.embed) {
    const parsed = embedSpecSchema.safeParse(command.embed);
    if (parsed.success) embed = buildEmbedFromSpec(parsed.data, transform);
  }
  return {
    content: content || undefined,
    embeds: embed ? [embed] : [],
    allowedMentions: { parse: ['users'] },
  };
}

/**
 * If the message invokes a tag (`{prefix}{name}`), reply with it and return
 * true. Only prefixed messages hit the database.
 */
export async function handlePrefixTag(message: Message<true>, prefix: string): Promise<boolean> {
  if (!message.content.startsWith(prefix)) return false;
  const name = message.content.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
  if (!name) return false;

  const command = await prisma.customCommand.findUnique({
    where: { guildId_name: { guildId: message.guildId, name } },
  });
  if (!command) return false;

  void prisma.customCommand
    .update({ where: { id: command.id }, data: { uses: { increment: 1 } } })
    .catch(() => undefined);

  const transform = (value: string): string =>
    applyPlaceholders(value, placeholderMemberFromMessage(message));
  const body = renderCustomCommand(command, transform);
  if (!body.content && (body.embeds?.length ?? 0) === 0) return true;
  await message.reply(body).catch(() => undefined);
  return true;
}

/** Reply with the first matching auto-responder, if any. */
export async function handleAutoResponders(
  message: Message<true>,
  responders: AutoResponder[],
): Promise<void> {
  if (responders.length === 0) return;
  const responder = matchAutoResponder(message.content, responders);
  if (!responder) return;
  await message
    .reply({ content: responder.response.slice(0, 2000), allowedMentions: { parse: ['users'] } })
    .catch(() => undefined);
}

/** Handle tag invocation then auto-responders for one message (module-gated). */
export async function handleCustomCommandsMessage(
  message: Message<true>,
  config: CustomCommandsConfig,
): Promise<void> {
  const handled = await handlePrefixTag(message, config.prefix);
  if (!handled) await handleAutoResponders(message, config.autoResponders);
}
