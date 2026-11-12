import { FEATURES } from '@refx/shared';
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequireLevel } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { runRefxSetup } from '../../modules/refxSetup';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('refx-setup')
    .setDescription(
      'Point every module at the ReFx channels and roles (config only, safe to re-run).',
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  available: () => FEATURES.fivem,
  preconditions: [RequireGuild, RequireLevel('admin')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await runRefxSetup(interaction.guild, interaction.user.id, ctx);
      const lines = [
        `**Configured:** ${result.modules.join(', ')}`,
        result.formsCreated.length
          ? `**Application forms created:** ${result.formsCreated.join(', ')}`
          : '**Application forms:** already there',
        `**Role panel:** ${result.rolePanelCreated ? 'created (not posted yet)' : 'already there or no roles found'}`,
      ];
      if (result.missing.length)
        lines.push(`\n⚠️ **Not found, left unset:** ${result.missing.join(', ')}`);
      lines.push(
        '\n**Next, in the dashboard:** post the verification, ticket, application and role panels,',
        'set the city restart times on the FiveM City page, and turn the whitelist on once the',
        '`refx_whitelist` resource is running on the server.',
      );
      await interaction.editReply({
        embeds: [
          brandedEmbed({
            kind: 'success',
            title: 'ReFx setup applied',
            description: lines.join('\n'),
          }),
        ],
      });
    } catch (err) {
      ctx.logger.error({ err, guildId: interaction.guildId }, 'ReFx setup failed');
      await interaction.editReply({
        embeds: [errorEmbed('Setup failed. Check the bot logs for details.')],
      });
    }
  },
};

export default command;
