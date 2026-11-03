import type { EmbedBuilder } from 'discord.js';
import type { LogCategory, LoggingConfig } from '@refx/shared';
import type { BotContext } from '../framework/context';

const CHANNEL_KEY: Record<LogCategory, keyof LoggingConfig> = {
  message: 'messageChannelId',
  member: 'memberChannelId',
  server: 'serverChannelId',
  voice: 'voiceChannelId',
};

export interface LogMeta {
  channelId?: string | null;
  userId?: string | null;
  roleIds?: string[];
}

/** Pure ignore-list check — exported for unit testing. */
export function isIgnored(config: LoggingConfig, meta: LogMeta): boolean {
  if (meta.channelId && config.ignoredChannelIds.includes(meta.channelId)) return true;
  if (meta.userId && config.ignoredUserIds.includes(meta.userId)) return true;
  if (meta.roleIds?.some((id) => config.ignoredRoleIds.includes(id))) return true;
  return false;
}

/** Route a log embed to the configured channel for its category (§8B). */
export async function sendLog(
  ctx: BotContext,
  guildId: string,
  category: LogCategory,
  embed: EmbedBuilder,
  meta: LogMeta = {},
): Promise<void> {
  if (!(await ctx.config.isEnabled(guildId, 'LOGGING'))) return;
  const config = await ctx.config.getConfig(guildId, 'LOGGING');
  if (isIgnored(config, meta)) return;

  const channelId = config[CHANNEL_KEY[category]] as string | null;
  if (!channelId) return;

  const guild = ctx.client.guilds.cache.get(guildId);
  if (!guild) return;
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  if (channel && channel.isTextBased() && !channel.isDMBased()) {
    await channel
      .send({ embeds: [embed] })
      .catch((err: unknown) => ctx.logger.warn({ err, guildId }, 'Log send failed'));
  }
}
