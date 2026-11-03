import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { BRAND } from '@refx/shared';
import type { Command } from '../../framework/command';
import { env } from '../../env';
import { Cooldown } from '../../lib/permissions';
import { brandedEmbed } from '../../lib/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to use the bot — city status, levels, tickets and staff tools.'),
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
          description: `I run the ${BRAND.community} Discord: city status, welcomes, levels, tickets, applications and moderation.`,
        }).addFields(
          {
            name: 'Popular commands',
            value: [
              '`/status` · `/players` — is the city up, and who’s in it',
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
              'Everything else is configured from the dashboard; `/refx-setup` re-links the modules to the ReFx channels and roles.',
          },
        ),
      ],
      components: links.components.length > 0 ? [links] : [],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
