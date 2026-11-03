import { MessageFlags } from 'discord.js';
import { defineComponent } from '../framework/component';
import { buildPlayersEmbed, readSnapshot } from '../modules/fivem';

/** Players button under the status panel: an ephemeral player list. */
export default defineComponent({
  module: 'fivem',
  async handle(interaction, parsed, ctx) {
    if (!interaction.isButton() || parsed.action !== 'players' || !interaction.inGuild()) return;
    const config = await ctx.config.getConfig(interaction.guildId, 'FIVEM');
    const snapshot = await readSnapshot(ctx, interaction.guildId);
    await interaction.reply({
      embeds: [buildPlayersEmbed(config, snapshot)],
      flags: MessageFlags.Ephemeral,
    });
  },
});
