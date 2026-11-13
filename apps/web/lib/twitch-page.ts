import { prisma } from '@refx/database';
import { twitchChatConfigSchema, type TwitchChatConfig } from '@refx/shared';
import { guardGuildAccess } from './auth-guards';

/** What every Twitch dashboard page needs: access check, settings, on/off. */
export async function loadTwitchPage(
  guildId: string,
): Promise<{ config: TwitchChatConfig; enabled: boolean }> {
  await guardGuildAccess(guildId);
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TWITCH_CHAT' } },
    select: { config: true, enabled: true },
  });
  return {
    config: twitchChatConfigSchema.parse(row?.config ?? {}),
    enabled: Boolean(row?.enabled),
  };
}

/** Whether the channel's streamer connected their own Twitch account. */
export async function broadcasterConnected(channel: string | null): Promise<boolean> {
  if (!channel) return false;
  const row = await prisma.twitchAccount.findFirst({
    where: { id: { startsWith: 'broadcaster:' }, login: channel },
    select: { id: true },
  });
  return Boolean(row);
}
