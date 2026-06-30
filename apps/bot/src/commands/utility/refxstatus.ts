import { SlashCommandBuilder } from 'discord.js';
import {
  DEFAULT_REFX_STATUS_URL,
  fetchRefxStatus,
  refxStatusEmoji,
  type RefxRegion,
} from '@helios/shared';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { Cooldown } from '../../lib/permissions';
import type { Command } from '../../framework/command';

const STATUS_URL = process.env.REFX_STATUS_URL ?? DEFAULT_REFX_STATUS_URL;

function regionLine(region: RefxRegion): string {
  const header = `${refxStatusEmoji(region.status)} **${region.name}** — ${region.nodesUp}/${region.nodesTotal} nodes up`;
  const nodes = region.nodes
    .map((node) => `${refxStatusEmoji(node.status)} \`${node.name}\``)
    .join('\n');
  return nodes ? `${header}\n${nodes}` : header;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('refxstatus')
    .setDescription('Show ReFx Hosting node & service status.'),
  preconditions: [Cooldown(10)],
  async execute(interaction) {
    await interaction.deferReply();
    let status;
    try {
      status = await fetchRefxStatus(STATUS_URL);
    } catch {
      await interaction.editReply({
        embeds: [errorEmbed('Couldn’t reach the ReFx status API right now.')],
      });
      return;
    }

    const data = status.data;
    const embed = brandedEmbed({
      kind: data.status.toLowerCase().includes('operational') ? 'success' : 'warning',
      title: 'ReFx Hosting Status',
      description: `${refxStatusEmoji(data.status)} Overall: **${data.status}**`,
    });

    if (data.components.length) {
      embed.addFields({
        name: 'Services',
        value: data.components
          .map((component) => `${refxStatusEmoji(component.status)} ${component.name}`)
          .join('\n'),
      });
    }

    for (const region of data.regions.slice(0, 10)) {
      embed.addFields({ name: '​', value: regionLine(region) });
    }

    if (data.incidents.active.length) {
      embed.addFields({
        name: '⚠️ Active incidents',
        value: data.incidents.active
          .map((incident) => `• ${incident.title ?? incident.status ?? 'Incident'}`)
          .join('\n')
          .slice(0, 1024),
      });
    }

    if (data.updatedAt) embed.setFooter({ text: `Updated` }).setTimestamp(new Date(data.updatedAt));

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
