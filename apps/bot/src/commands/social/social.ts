import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@solari/database';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium, RequireUserPermissions } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { env } from '../../env';
import { isSafePublicUrl, isSocialPlatform, platformAvailable } from '../../lib/social';
import { baselineSubscription, cancelSocialPoll, scheduleSocialPoll } from '../../modules/social';

const MAX_PER_GUILD = 25;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('social')
    .setDescription('Manage social media alerts (Twitch, YouTube, Reddit, Bluesky, RSS).')
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Watch a source and post new items to a channel.')
        .addStringOption((o) =>
          o
            .setName('platform')
            .setDescription('Which platform')
            .setRequired(true)
            .addChoices(
              { name: 'Twitch (goes live)', value: 'twitch' },
              { name: 'YouTube (new videos)', value: 'youtube' },
              { name: 'Reddit (new posts)', value: 'reddit' },
              { name: 'Bluesky (new posts)', value: 'bluesky' },
              { name: 'RSS / Atom feed', value: 'rss' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('target')
            .setDescription('Twitch login · YouTube channel id (UC…) · subreddit · Bluesky handle · feed URL')
            .setRequired(true),
        )
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Where to post (defaults to here)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((o) => o.setName('mention').setDescription('Role to ping on new items')),
    )
    .addSubcommand((s) => s.setName('list').setDescription("List this server's alerts."))
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove an alert by its id.')
        .addStringOption((o) =>
          o.setName('id').setDescription('Alert id from /social list').setRequired(true),
        ),
    ),
  module: 'SOCIAL',
  preconditions: [
    RequireGuild,
    RequirePremium('SOCIAL'),
    RequireUserPermissions(PermissionFlagsBits.ManageGuild),
  ],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const rows = await prisma.socialSubscription.findMany({
        where: { guildId: interaction.guildId },
        orderBy: { createdAt: 'asc' },
      });
      if (rows.length === 0) {
        await interaction.reply({
          embeds: [
            brandedEmbed({ kind: 'info', description: 'No alerts yet. Add one with `/social add`.' }),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const lines = rows.map(
        (r: { id: string; platform: string; target: string; channelId: string; mentionRoleId: string | null }) =>
          `\`${r.id.slice(0, 8)}\` **${r.platform}** · \`${r.target}\` → <#${r.channelId}>` +
          (r.mentionRoleId ? ` · pings <@&${r.mentionRoleId}>` : ''),
      );
      await interaction.reply({
        embeds: [brandedEmbed({ kind: 'default', title: '🔔 Social alerts', description: lines.join('\n') })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'remove') {
      const idPrefix = interaction.options.getString('id', true).trim();
      const row = await prisma.socialSubscription.findFirst({
        where: { guildId: interaction.guildId, id: { startsWith: idPrefix } },
      });
      if (!row) {
        await interaction.reply({
          embeds: [errorEmbed('No alert with that id. Check `/social list`.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await prisma.socialSubscription.delete({ where: { id: row.id } });
      await cancelSocialPoll(ctx.jobs, row.id);
      await interaction.reply({
        embeds: [brandedEmbed({ kind: 'success', description: '🗑️ Alert removed.' })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // add
    const platform = interaction.options.getString('platform', true);
    if (!isSocialPlatform(platform)) {
      await interaction.reply({ embeds: [errorEmbed('Unknown platform.')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (!platformAvailable(platform, env)) {
      await interaction.reply({
        embeds: [
          errorEmbed('Twitch alerts need `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` set on the bot host.'),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const target = interaction.options.getString('target', true).trim();
    // SSRF guard: an rss target is a raw URL the bot will fetch — require a
    // public http(s) host (no localhost / private / link-local addresses).
    if (platform === 'rss' && !isSafePublicUrl(target)) {
      await interaction.reply({
        embeds: [errorEmbed('Provide a public `http(s)` feed URL (private/local addresses are blocked).')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const channelId = interaction.options.getChannel('channel')?.id ?? interaction.channelId;
    const mention = interaction.options.getRole('mention');

    const count = await prisma.socialSubscription.count({ where: { guildId: interaction.guildId } });
    if (count >= MAX_PER_GUILD) {
      await interaction.reply({
        embeds: [errorEmbed(`This server already has the maximum of ${MAX_PER_GUILD} alerts.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();
    const created = await prisma.socialSubscription.create({
      data: {
        guildId: interaction.guildId,
        platform,
        target,
        channelId,
        mentionRoleId: mention?.id ?? null,
      },
    });
    // Baseline to the current latest so we don't dump the backlog, then start polling.
    await baselineSubscription(created.id).catch(() => undefined);
    await scheduleSocialPoll(ctx.jobs, created.id);

    await interaction.editReply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description: `✅ Watching **${platform}** \`${target}\` — new items post to <#${channelId}>.`,
        }),
      ],
    });
  },
};

export default command;
