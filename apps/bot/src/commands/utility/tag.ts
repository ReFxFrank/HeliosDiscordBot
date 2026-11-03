import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import { customCommandInputSchema } from '@refx/shared';
import { brandedEmbed, errorEmbed, successEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import { applyPlaceholders, type PlaceholderMember } from '../../lib/placeholders';
import { renderCustomCommand } from '../../modules/customCommands';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Show and manage custom commands (tags).')
    .addSubcommand((s) =>
      s
        .setName('show')
        .setDescription('Show a tag.')
        .addStringOption((o) => o.setName('name').setDescription('Tag name').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List this server’s tags.'))
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Create a text tag (use the dashboard for embeds).')
        .addStringOption((o) => o.setName('name').setDescription('Tag name').setRequired(true))
        .addStringOption((o) =>
          o.setName('content').setDescription('What the tag says').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('delete')
        .setDescription('Delete a tag.')
        .addStringOption((o) => o.setName('name').setDescription('Tag name').setRequired(true)),
    ),
  module: 'CUSTOM_COMMANDS',
  preconditions: [RequireGuild],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const tags = await prisma.customCommand.findMany({
        where: { guildId: interaction.guildId },
        orderBy: { uses: 'desc' },
        take: 100,
        select: { name: true, uses: true },
      });
      await interaction.reply({
        embeds: [
          brandedEmbed({
            title: `Tags (${tags.length})`,
            description: tags.length
              ? tags
                  .map((tag) => `\`${tag.name}\` · ${tag.uses}`)
                  .join('\n')
                  .slice(0, 4000)
              : 'No tags yet. Create one with `/tag create`.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const name = interaction.options.getString('name', true).trim().toLowerCase();

    if (sub === 'show') {
      const tag = await prisma.customCommand.findUnique({
        where: { guildId_name: { guildId: interaction.guildId, name } },
      });
      if (!tag) {
        await interaction.reply({
          embeds: [errorEmbed(`No tag named \`${name}\`.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      void prisma.customCommand
        .update({ where: { id: tag.id }, data: { uses: { increment: 1 } } })
        .catch(() => undefined);
      const member: PlaceholderMember = {
        user: {
          id: interaction.user.id,
          tag: interaction.user.tag,
          username: interaction.user.username,
          createdTimestamp: interaction.user.createdTimestamp,
        },
        guild: { name: interaction.guild.name, memberCount: interaction.guild.memberCount },
      };
      await interaction.reply(
        renderCustomCommand(tag, (value) => applyPlaceholders(value, member)),
      );
      return;
    }

    // create / delete require Manage Messages.
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        embeds: [errorEmbed('You need Manage Messages to manage tags.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'create') {
      const content = interaction.options.getString('content', true);
      const parsed = customCommandInputSchema.safeParse({ name, content });
      if (!parsed.success) {
        await interaction.reply({
          embeds: [errorEmbed(parsed.error.issues[0]?.message ?? 'Invalid tag.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const existing = await prisma.customCommand.findUnique({
        where: { guildId_name: { guildId: interaction.guildId, name } },
      });
      if (existing) {
        await interaction.reply({
          embeds: [errorEmbed(`A tag named \`${name}\` already exists.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await prisma.customCommand.create({
        data: {
          guildId: interaction.guildId,
          name,
          content: parsed.data.content ?? null,
          createdBy: interaction.user.id,
        },
      });
      await interaction.reply({
        embeds: [successEmbed(`Created tag \`${name}\`.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // delete
    const deleted = await prisma.customCommand.deleteMany({
      where: { guildId: interaction.guildId, name },
    });
    await interaction.reply({
      embeds: [
        deleted.count
          ? successEmbed(`Deleted tag \`${name}\`.`)
          : errorEmbed(`No tag named \`${name}\`.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
