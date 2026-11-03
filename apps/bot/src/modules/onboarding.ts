import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Guild } from 'discord.js';
import { prisma } from '@refx/database';
import { BRAND } from '@refx/shared';
import { env } from '../env';
import { brandedEmbed } from '../lib/embeds';

/**
 * DM the server owner a one-time hello when the bot joins a guild: what it is,
 * how to set it up, and a button to the dashboard. It's a DM rather than a post
 * in the system channel because on a community server that channel is public
 * (on ReFx it's #boosts). Idempotent via `Guild.onboardedAt`, so a re-invite or
 * a duplicate gateway event never sends it twice. Best-effort: closed DMs or a
 * race just no-op.
 */
export async function sendGuildWelcome(guild: Guild): Promise<void> {
  // Claim the onboarding slot atomically: only the update that actually flips a
  // still-null onboardedAt proceeds to post. Concurrent guildCreate handling or
  // a quick leave/rejoin can't produce two welcomes.
  const claimed = await prisma.guild.updateMany({
    where: { id: guild.id, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const owner = await guild.fetchOwner().catch(() => null);
  if (!owner) return;

  const embed = brandedEmbed({
    title: `👋 ${BRAND.name} joined ${guild.name}`,
    description:
      `I run the ${BRAND.community} Discord: FiveM city status, welcomes, verification, ` +
      'tickets, applications, levels and moderation, all managed from one dashboard.\n\n' +
      '**Get started:** run `/refx-setup` to link every module to the ReFx channels and ' +
      'roles, then post the panels from the dashboard. `/help` lists the commands.',
  });

  const components = env.DASHBOARD_URL
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Open dashboard')
            .setURL(`${env.DASHBOARD_URL.replace(/\/$/, '')}/servers/${guild.id}`),
        ),
      ]
    : [];

  await owner.send({ embeds: [embed], components }).catch(() => undefined);
}
