import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { FEATURES } from '@refx/shared';
import type { Command } from '../../framework/command';
import { RequireGuild, RequireLevel } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { runCommunitySetup } from '../../modules/communitySetup';

const TWITCH_NOTES = {
  added: '✅ Twitch go-live alert added.',
  exists: 'Twitch go-live alert was already set up.',
  'no-channel':
    '⚠️ No channel found for go-live alerts. Run this again with `live_channel`, or use `/social add`.',
  'no-credentials':
    '⚠️ Twitch alerts need `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` set on the bot host first.',
} as const;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('community-setup')
    .setDescription('Link the modules to this server’s channels and roles (safe to re-run).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName('twitch').setDescription('Twitch username to announce when it goes live'),
    )
    .addChannelOption((o) =>
      o
        .setName('live_channel')
        .setDescription('Where go-live alerts post (otherwise found by name)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addRoleOption((o) => o.setName('live_role').setDescription('Role to ping on go-live')),
  available: () => !FEATURES.fivem,
  preconditions: [RequireGuild, RequireLevel('admin')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await runCommunitySetup(
        interaction.guild,
        interaction.user.id,
        {
          twitch: interaction.options.getString('twitch'),
          liveChannelId: interaction.options.getChannel('live_channel')?.id ?? null,
          liveRoleId: interaction.options.getRole('live_role')?.id ?? null,
        },
        ctx,
      );
      const lines = [`**Turned on:** ${result.modules.join(', ')}`];
      if (result.linked.length) lines.push(`\n**Linked**\n${result.linked.join('\n')}`);
      if (result.missing.length) {
        lines.push(
          `\n⚠️ **Not found, left unset:** ${result.missing.join(', ')}`,
          'Create or rename those channels and run this again, or pick them on the dashboard.',
        );
      }
      if (result.twitch) lines.push(`\n${TWITCH_NOTES[result.twitch]}`);
      await interaction.editReply({
        embeds: [
          brandedEmbed({
            kind: 'success',
            title: 'Community setup applied',
            description: lines.join('\n').slice(0, 4000),
          }),
        ],
      });
    } catch (err) {
      ctx.logger.error({ err, guildId: interaction.guildId }, 'Community setup failed');
      await interaction.editReply({
        embeds: [errorEmbed('Setup failed. Check the bot logs for details.')],
      });
    }
  },
};

export default command;
