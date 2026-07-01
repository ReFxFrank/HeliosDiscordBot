import { AttachmentBuilder, type GuildMember, type PartialGuildMember } from 'discord.js';
import { applyPlaceholders } from '../lib/placeholders';
import { renderWelcomeCard } from '../lib/welcomeCard';
import type { BotContext } from '../framework/context';

async function fetchSendableChannel(member: GuildMember, channelId: string) {
  const cached = member.guild.channels.cache.get(channelId);
  const channel = cached ?? (await member.guild.channels.fetch(channelId).catch(() => null));
  if (channel && channel.isTextBased() && !channel.isDMBased()) return channel;
  return null;
}

/** Send the configured welcome message(s) and apply autoroles for a new member. */
export async function handleMemberJoin(member: GuildMember, ctx: BotContext): Promise<void> {
  await Promise.allSettled([sendWelcome(member, ctx), applyAutoroles(member, ctx)]);
}

async function sendWelcome(member: GuildMember, ctx: BotContext): Promise<void> {
  if (!(await ctx.config.isEnabled(member.guild.id, 'WELCOME'))) return;
  const config = await ctx.config.getConfig(member.guild.id, 'WELCOME');

  if (config.channelId) {
    const channel = await fetchSendableChannel(member, config.channelId);
    if (channel) {
      const files: AttachmentBuilder[] = [];
      if (config.cardEnabled) {
        try {
          const png = await renderWelcomeCard({
            displayName: member.displayName,
            avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }),
            title: 'Welcome',
            subtitle: `Member #${member.guild.memberCount}`,
            backgroundUrl: config.cardBackground,
          });
          files.push(new AttachmentBuilder(png, { name: 'welcome.png' }));
        } catch (err) {
          ctx.logger.warn({ err, guildId: member.guild.id }, 'Welcome card render failed');
        }
      }
      await channel
        .send({ content: applyPlaceholders(config.message, member), files })
        .catch((err: unknown) =>
          ctx.logger.warn({ err, guildId: member.guild.id }, 'Welcome send failed'),
        );
    }
  }

  if (config.dmEnabled && config.dmMessage.trim()) {
    await member.send(applyPlaceholders(config.dmMessage, member)).catch(() => undefined);
  }
}

async function applyAutoroles(member: GuildMember, ctx: BotContext): Promise<void> {
  if (!(await ctx.config.isEnabled(member.guild.id, 'AUTOROLE'))) return;
  const config = await ctx.config.getConfig(member.guild.id, 'AUTOROLE');
  const roleIds = member.user.bot ? config.botRoleIds : config.humanRoleIds;
  const assignable = roleIds.filter((id) => member.guild.roles.cache.has(id));
  if (assignable.length === 0) return;
  await member.roles
    .add(assignable, 'Autorole on join')
    .catch((err: unknown) => ctx.logger.warn({ err, guildId: member.guild.id }, 'Autorole failed'));
}

/** Send the configured leave message for a departing member. */
export async function handleMemberLeave(
  member: GuildMember | PartialGuildMember,
  ctx: BotContext,
): Promise<void> {
  if (!(await ctx.config.isEnabled(member.guild.id, 'WELCOME'))) return;
  const config = await ctx.config.getConfig(member.guild.id, 'WELCOME');
  if (!config.leaveChannelId || !config.leaveMessage.trim()) return;

  const cached = member.guild.channels.cache.get(config.leaveChannelId);
  const channel =
    cached ?? (await member.guild.channels.fetch(config.leaveChannelId).catch(() => null));
  if (channel && channel.isTextBased() && !channel.isDMBased()) {
    await channel
      .send({ content: applyPlaceholders(config.leaveMessage, member) })
      .catch((err: unknown) =>
        ctx.logger.warn({ err, guildId: member.guild.id }, 'Leave send failed'),
      );
  }
}
