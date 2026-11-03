import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { setMemberFlag } from '../lib/memberStats';
import { evaluateAchievements } from '../modules/achievements';
import { handleBoost } from '../modules/welcome';

export default defineEvent({
  name: Events.GuildMemberUpdate,
  async execute(ctx, oldMember, newMember) {
    // Member started boosting: premiumSince transitions from null → set.
    if (oldMember.premiumSince || !newMember.premiumSince) return;
    // An uncached (partial) old member always reads null; only thank boosts
    // that actually started just now so a cold cache can't re-thank old boosters.
    if (!oldMember.partial || Date.now() - newMember.premiumSince.getTime() < 5 * 60_000) {
      await handleBoost(newMember, ctx);
    }
    if (!(await ctx.config.isEnabled(newMember.guild.id, 'ACHIEVEMENTS'))) return;
    await setMemberFlag(newMember.guild.id, newMember.id, 'boosted');
    await evaluateAchievements(newMember.guild.id, newMember.id, ctx);
  },
});
