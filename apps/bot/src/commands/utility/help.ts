import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { BRAND, FEATURES } from '@refx/shared';
import type { Command } from '../../framework/command';
import { env } from '../../env';
import { Cooldown } from '../../lib/permissions';
import { brandedEmbed } from '../../lib/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription(
      FEATURES.fivem
        ? 'How to use the bot — city status, levels, tickets and staff tools.'
        : 'How to use the bot — levels, roles, tickets and staff tools.',
    ),
  preconditions: [Cooldown(5)],
  async execute(interaction) {
    const links = new ActionRowBuilder<ButtonBuilder>();
    if (env.DASHBOARD_URL) {
      links.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Dashboard')
          .setURL(`${env.DASHBOARD_URL.replace(/\/$/, '')}/servers`),
      );
    }
    if (env.SUPPORT_SERVER_INVITE) {
      links.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Support server')
          .setURL(env.SUPPORT_SERVER_INVITE),
      );
    }

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'info',
          title: `👋 ${BRAND.name}`,
          description: FEATURES.fivem
            ? `I run the ${BRAND.community} Discord: city status, welcomes, levels, tickets, applications and moderation.`
            : `I run the ${BRAND.community} Discord: go-live alerts, welcomes, levels, roles, giveaways, tickets and moderation.`,
        }).addFields(
          {
            name: 'Popular commands',
            value: [
              ...(FEATURES.fivem
                ? ['`/status` · `/players` — is the city up, and who’s in it']
                : []),
              '`/rank` · `/leaderboard` — levels and XP',
              '`/ticket` — get help from staff',
              '`/giveaway` · `/poll` · `/remind` — community tools',
              '`/userinfo` · `/serverinfo` · `/avatar` — quick lookups',
            ].join('\n'),
          },
          {
            name: 'For staff',
            value:
              '`/warn` · `/warnings` · `/timeout` · `/ban` — moderation\n' +
              (FEATURES.fivem
                ? 'Everything else is configured from the dashboard; `/refx-setup` re-links the modules to the ReFx channels and roles.'
                : '`/social` — go-live and new-video alerts\nEverything else is configured from the dashboard; `/community-setup` links the modules to your channels.'),
          },
        ),
      ],
      components: links.components.length > 0 ? [links] : [],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
