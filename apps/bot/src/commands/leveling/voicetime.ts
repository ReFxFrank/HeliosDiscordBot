import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import { brandedEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import type { Command } from '../../framework/command';

/** "3d 4h 12m" / "2h 05m" / "14m" from a minute count. */
export function formatVoiceMinutes(total: number): string {
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('voicetime')
    .setDescription('How long someone has spent in voice channels on this server.')
    .addUserOption((o) => o.setName('user').setDescription('Defaults to you')),
  module: 'LEVELING',
  preconditions: [RequireGuild],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser('user') ?? interaction.user;

    const row = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guildId, userId: target.id } },
      select: { voiceMinutes: true },
    });
    const minutes = row?.voiceMinutes ?? 0;
    if (minutes === 0) {
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'info',
            description:
              `${target} has no tracked voice time yet. Time counts while in a voice channel ` +
              '(AFK channel and deafened time don’t count).',
          }),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    // Rank among tracked members (ties share the better rank).
    const ahead = await prisma.userLevel.count({
      where: { guildId: interaction.guildId, voiceMinutes: { gt: minutes } },
    });
    const member = interaction.guild.members.cache.get(target.id);
    const inVoiceNow = Boolean(member?.voice.channelId);

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'default',
          title: '🎙️ Voice time',
        }).setDescription(
          [
            `**Member:** ${target}`,
            `**Total voice time:** ${formatVoiceMinutes(minutes)}`,
            `**Server rank:** #${ahead + 1}`,
            inVoiceNow ? '🟢 In voice right now — the timer is running.' : null,
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
