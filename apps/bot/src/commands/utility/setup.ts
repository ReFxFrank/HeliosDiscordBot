import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { getServerTemplate, SERVER_TEMPLATES, templateChannelCount } from '@refx/shared';
import type { Command } from '../../framework/command';
import { RequireGuild, RequireLevel } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { applyServerTemplate } from '../../modules/serverTemplate';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up this server from a template — channels, roles & modules.')
    .addStringOption((o) =>
      o
        .setName('template')
        .setDescription('Which starter layout to build')
        .setRequired(true)
        .addChoices(
          ...SERVER_TEMPLATES.map((template) => ({
            name: `${template.emoji} ${template.name}`,
            value: template.id,
          })),
        ),
    ),
  // No `module` gate — setup must always be available. Admin-level only.
  preconditions: [RequireGuild, RequireLevel('admin')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;

    const templateId = interaction.options.getString('template', true);
    const template = getServerTemplate(templateId);
    if (!template) {
      await interaction.reply({
        embeds: [errorEmbed('That template no longer exists.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const categories = template.categories.length;
    const channels = templateChannelCount(template) - categories;

    const preview = brandedEmbed({
      kind: 'info',
      title: `${template.emoji} ${template.name}`,
      description: template.description,
    }).addFields(
      {
        name: 'Creates',
        value: `**${channels}** channels in **${categories}** categories · **${template.roles.length}** roles`,
      },
      { name: 'Enables', value: template.modules.join(', ') },
      {
        name: 'Heads-up',
        value:
          'Existing channels and roles with the same name are left untouched — nothing is deleted.',
      },
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('setup:confirm')
        .setLabel('Build it')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('setup:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    const response = await interaction.reply({
      embeds: [preview],
      components: [row],
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    });
    const message = response.resource?.message;
    if (!message) return;

    let confirmation;
    try {
      confirmation = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 60_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [
          brandedEmbed({ kind: 'default', description: 'Setup timed out — nothing changed.' }),
        ],
        components: [],
      });
      return;
    }

    if (confirmation.customId === 'setup:cancel') {
      await confirmation.update({
        embeds: [brandedEmbed({ kind: 'default', description: 'Cancelled — nothing changed.' })],
        components: [],
      });
      return;
    }

    await confirmation.update({
      embeds: [
        brandedEmbed({
          kind: 'info',
          description: `${template.emoji} Building the **${template.name}** layout…`,
        }),
      ],
      components: [],
    });

    const outcome = await applyServerTemplate(interaction.guild, templateId, interaction.user.id, {
      logger: ctx.logger,
    });
    if (!outcome.ok) {
      await interaction.editReply({ embeds: [errorEmbed(outcome.error)] });
      return;
    }

    const { result } = outcome;
    const lines = [
      `**${result.createdChannels}** channels created` +
        (result.skippedChannels ? ` · ${result.skippedChannels} already existed` : ''),
      `**${result.createdRoles.length}** roles created` +
        (result.skippedRoles.length ? ` · ${result.skippedRoles.length} already existed` : ''),
    ];
    if (result.enabledModules.length)
      lines.push(`Modules enabled: ${result.enabledModules.join(', ')}`);
    if (result.hitChannelLimit) {
      lines.push("⚠️ Stopped early — this server is near Discord's 500-channel limit.");
    }

    await interaction.editReply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          title: `${result.templateEmoji} ${result.templateName} applied`,
          description: lines.join('\n'),
        }),
      ],
    });
  },
};

export default command;
