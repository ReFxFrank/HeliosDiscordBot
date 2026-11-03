import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { prisma, type CaseType } from '@refx/database';
import type { Command } from '../../framework/command';
import { RequireGuild, RequireUserPermissions } from '../../lib/permissions';
import { brandedEmbed } from '../../lib/embeds';
import { activeWarnCount } from '../../lib/moderation';

const TYPE_ICON: Record<CaseType, string> = {
  WARN: '⚠️',
  MUTE: '🔇',
  KICK: '👢',
  BAN: '🔨',
  SOFTBAN: '🧹',
  TEMPBAN: '⏳',
  UNBAN: '♻️',
  NOTE: '📝',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View a member’s moderation history.')
    .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  module: 'MODERATION',
  preconditions: [RequireGuild, RequireUserPermissions(PermissionFlagsBits.ModerateMembers)],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser('user', true);

    const [cases, warns] = await Promise.all([
      prisma.moderationCase.findMany({
        where: { guildId: interaction.guildId, targetId: target.id },
        orderBy: { caseNumber: 'desc' },
        take: 10,
      }),
      activeWarnCount(interaction.guildId, target.id),
    ]);

    const lines = cases.map((c) => {
      const when = `<t:${Math.floor(c.createdAt.getTime() / 1000)}:R>`;
      const reason = c.reason ? ` — ${c.reason}` : '';
      return `${TYPE_ICON[c.type]} **#${c.caseNumber}** ${c.type}${reason} · ${when}`;
    });

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: warns > 0 ? 'warning' : 'info',
          title: `Moderation history · ${target.tag}`,
          description:
            `**Active warns:** ${warns}\n\n` +
            (lines.length > 0 ? lines.join('\n') : 'No cases on record.'),
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
