import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { scheduleMemberCountSync } from '../lib/guildSync';
import { handleMemberJoin } from '../modules/welcome';
import { handleInviteJoin } from '../modules/inviteTracking';
import { brandedEmbed } from '../lib/embeds';
import { sendLog } from '../lib/logging';

export default defineEvent({
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    scheduleMemberCountSync(member.guild);
    // Resolve the inviter first (diff invites promptly to minimize races), but
    // isolate its failures — a transient DB error here must never suppress the
    // welcome message, autoroles, or the join log below.
    await handleInviteJoin(member, ctx.logger).catch((err: unknown) =>
      ctx.logger.error({ err, guildId: member.guild.id }, 'Invite-join handling failed'),
    );
    await handleMemberJoin(member, ctx);

    const embed = brandedEmbed({ kind: 'success', title: 'Member joined' })
      .setDescription(`<@${member.id}> (\`${member.user.tag}\`)`)
      .addFields({
        name: 'Account created',
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      });
    await sendLog(ctx, member.guild.id, 'member', embed, { userId: member.id });
  },
});
