import { MessageFlags } from 'discord.js';
import { prisma } from '@helios/database';
import { defineComponent } from '../framework/component';
import { voteSuggestion } from '../modules/suggestions';

export default defineComponent({
  module: 'suggestion',
  async handle(interaction, parsed, ctx) {
    if (!interaction.inCachedGuild()) return;
    const id = parsed.args[0];
    const value = parsed.action === 'up' ? 1 : parsed.action === 'down' ? -1 : 0;
    if (!id || value === 0) return;

    const suggestion = await prisma.suggestion.findUnique({ where: { id }, select: { id: true } });
    if (!suggestion) {
      await interaction.reply({
        content: 'This suggestion no longer exists.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: value > 0 ? '👍 Voted up.' : '👎 Voted down.',
      flags: MessageFlags.Ephemeral,
    });
    await voteSuggestion(id, interaction.user.id, value, {
      client: ctx.client,
      logger: ctx.logger,
    });
  },
});
