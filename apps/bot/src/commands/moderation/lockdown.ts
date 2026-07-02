import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { brandedEmbed, errorEmbed, successEmbed } from '../../lib/embeds';
import { RequireGuild, RequireUserPermissions } from '../../lib/permissions';
import { postModLog } from '../../lib/moderation';
import { botCanLockdown, endLockdown, lockdownServer } from '../../modules/lockdown';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock the whole server (raid panic button) or lift a lockdown.')
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Lock every channel members can talk in.')
        .addStringOption((o) => o.setName('reason').setDescription('Why the server is locking down')),
    )
    .addSubcommand((s) =>
      s.setName('end').setDescription('Unlock every channel locked by a lockdown or /lock.'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  module: 'MODERATION',
  preconditions: [RequireGuild, RequireUserPermissions(PermissionFlagsBits.ManageGuild)],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    if (!botCanLockdown(interaction.guild)) {
      await interaction.reply({
        embeds: [errorEmbed('I need the **Manage Roles** permission to lock channels.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    // Editing many channels can exceed the 3s ack window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const config = await ctx.config.getConfig(interaction.guildId, 'MODERATION');

    if (sub === 'start') {
      const reason = interaction.options.getString('reason');
      const { locked, skipped } = await lockdownServer(
        interaction.guild,
        interaction.user.id,
        reason,
        { announce: true },
      );
      await interaction.editReply({
        embeds: [
          successEmbed(
            `Locked **${locked}** channel${locked === 1 ? '' : 's'}` +
              (skipped ? ` (skipped ${skipped}).` : '.') +
              ' Run `/lockdown end` to lift it.',
          ),
        ],
      });
      await postModLog(
        ctx,
        interaction.guildId,
        config,
        brandedEmbed({
          kind: 'danger',
          title: '🔒 Server lockdown started',
          description: [
            `**Moderator:** ${interaction.user.tag}`,
            `**Channels locked:** ${locked}${skipped ? ` (skipped ${skipped})` : ''}`,
            reason ? `**Reason:** ${reason}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        }),
      );
      return;
    }

    // end
    const { restored } = await endLockdown(interaction.guild, { announce: true });
    await interaction.editReply({
      embeds: [
        restored > 0
          ? successEmbed(`Lifted the lockdown — restored **${restored}** channel${restored === 1 ? '' : 's'}.`)
          : brandedEmbed({ kind: 'info', description: 'There were no locked channels to restore.' }),
      ],
    });
    if (restored > 0) {
      await postModLog(
        ctx,
        interaction.guildId,
        config,
        brandedEmbed({
          kind: 'success',
          title: '🔓 Server lockdown lifted',
          description: `**Moderator:** ${interaction.user.tag}\n**Channels restored:** ${restored}`,
        }),
      );
    }
  },
};

export default command;
