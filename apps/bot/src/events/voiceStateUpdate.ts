import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { brandedEmbed } from '../lib/embeds';
import { sendLog } from '../lib/logging';
import { ensureVoiceXpTick } from '../modules/leveling';

export default defineEvent({
  name: Events.VoiceStateUpdate,
  async execute(ctx, oldState, newState) {
    const userId = newState.id;
    const guildId = newState.guild.id;

    // Someone (re)entered voice — wake the per-guild voice-XP loop if it isn't
    // already running. The tick self-validates eligibility and stops when voice
    // empties, so a non-human or solo joiner just costs one no-op tick.
    if (
      !newState.member?.user.bot &&
      newState.channelId &&
      newState.channelId !== oldState.channelId &&
      (await ctx.config.isEnabled(guildId, 'LEVELING'))
    ) {
      await ensureVoiceXpTick(guildId, ctx.jobs).catch((err: unknown) =>
        ctx.logger.warn({ err, guildId }, 'Failed to arm voice-XP tick'),
      );
    }

    let embed;
    if (!oldState.channelId && newState.channelId) {
      embed = brandedEmbed({
        kind: 'success',
        title: 'Voice joined',
        description: `<@${userId}> joined <#${newState.channelId}>`,
      });
    } else if (oldState.channelId && !newState.channelId) {
      embed = brandedEmbed({
        kind: 'danger',
        title: 'Voice left',
        description: `<@${userId}> left <#${oldState.channelId}>`,
      });
    } else if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      embed = brandedEmbed({
        kind: 'info',
        title: 'Voice moved',
        description: `<@${userId}> moved to <#${newState.channelId}>`,
      });
    } else {
      return; // mute/deafen/stream toggles — not logged for now
    }

    await sendLog(ctx, guildId, 'voice', embed, {
      userId,
      channelId: newState.channelId ?? oldState.channelId,
    });
  },
});
