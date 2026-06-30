import { MessageFlags } from 'discord.js';
import { prisma } from '@helios/database';
import { defineComponent } from '../framework/component';
import { POLL_LETTERS, buildPollMessage } from '../modules/polls';

export default defineComponent({
  module: 'poll',
  async handle(interaction, parsed, _ctx) {
    if (parsed.action !== 'vote' || !interaction.inCachedGuild()) return;
    const pollId = parsed.args[0];
    const optionIndex = Number(parsed.args[1]);
    if (!pollId || !Number.isInteger(optionIndex)) return;

    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll || poll.ended) {
      await interaction.reply({ content: 'This poll has closed.', flags: MessageFlags.Ephemeral });
      return;
    }
    const options = poll.options as string[];
    if (optionIndex < 0 || optionIndex >= options.length) return;

    await prisma.pollVote.upsert({
      where: { pollId_userId: { pollId, userId: interaction.user.id } },
      update: { optionIndex },
      create: { pollId, userId: interaction.user.id, optionIndex },
    });
    await interaction.reply({
      content: `Voted for ${POLL_LETTERS[optionIndex]} **${options[optionIndex]}**.`,
      flags: MessageFlags.Ephemeral,
    });

    const votes = await prisma.pollVote.findMany({
      where: { pollId },
      select: { optionIndex: true },
    });
    await interaction.message
      .edit(
        buildPollMessage({
          pollId,
          question: poll.question,
          options,
          votes,
          ended: false,
          endsAt: poll.endsAt,
        }),
      )
      .catch(() => undefined);
  },
});
