import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import { brandedEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import type { Command } from '../../framework/command';
import { formatVoiceMinutes } from './voicetime';

const MEDALS = ['🥇', '🥈', '🥉'];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('voicetop')
    .setDescription('Top members by time spent in voice channels.'),
  module: 'LEVELING',
  preconditions: [RequireGuild],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    const top = await prisma.userLevel.findMany({
      where: { guildId: interaction.guildId, voiceMinutes: { gt: 0 } },
      orderBy: { voiceMinutes: 'desc' },
      take: 10,
      select: { userId: true, voiceMinutes: true },
    });
    if (top.length === 0) {
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'info',
            description: 'No tracked voice time yet — hop in a voice channel to start the timer.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = top.map(
      (entry, index) =>
        `${MEDALS[index] ?? `**${index + 1}.**`} <@${entry.userId}> — \`${formatVoiceMinutes(entry.voiceMinutes)}\``,
    );

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'default',
          title: `🎙️ ${interaction.guild.name} — Voice leaderboard`,
          description: lines.join('\n'),
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
