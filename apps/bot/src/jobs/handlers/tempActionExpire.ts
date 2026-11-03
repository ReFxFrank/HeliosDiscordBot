import { DiscordAPIError, Routes } from 'discord.js';
import type { TempActionExpireJob } from '@refx/jobs';
import { createModerationCase, deactivateTempBans } from '../../lib/cases';
import type { JobContext } from '../../services/jobs';

/**
 * Discord error codes meaning "the target is already gone" — safe to treat as a
 * successful reversal rather than retrying forever.
 */
const ALREADY_GONE = new Set([
  10026, // Unknown Ban
  10007, // Unknown Member
  10011, // Unknown Role
]);

/**
 * Re-throw transient/unknown REST errors so BullMQ retries the job; swallow only
 * the "already gone" cases. This prevents a transient 429/5xx from being treated
 * as success (which would leave a user banned forever while the DB records an
 * unban).
 */
function ignoreIfAlreadyGone(err: unknown): void {
  if (err instanceof DiscordAPIError && ALREADY_GONE.has(Number(err.code))) return;
  throw err;
}

/**
 * Reverse an expired temporary action. Uses REST (`client.rest`) rather than
 * cache, so any shard's worker can execute it regardless of which shard owns
 * the guild.
 */
export async function handleTempActionExpire(
  data: TempActionExpireJob,
  ctx: JobContext,
): Promise<void> {
  const { client, logger } = ctx;

  switch (data.type) {
    case 'UNBAN': {
      try {
        await client.rest.delete(Routes.guildBan(data.guildId, data.userId), {
          reason: 'Temporary ban expired',
        });
      } catch (err) {
        ignoreIfAlreadyGone(err); // transient errors re-throw here -> job retries
        logger.info({ ...data }, 'tempActionExpire: user was already unbanned');
      }
      // Only runs once the unban is confirmed (or confirmed already-gone).
      await deactivateTempBans(data.guildId, data.userId);
      await createModerationCase({
        guildId: data.guildId,
        type: 'UNBAN',
        targetId: data.userId,
        moderatorId: client.user?.id ?? 'system',
        reason: 'Temporary ban expired',
      });
      logger.info({ ...data }, 'Temp-ban expired and reversed');
      return;
    }

    case 'UNMUTE': {
      try {
        await client.rest.patch(Routes.guildMember(data.guildId, data.userId), {
          body: { communication_disabled_until: null },
          reason: 'Mute expired',
        });
      } catch (err) {
        ignoreIfAlreadyGone(err);
        logger.info({ ...data }, 'tempActionExpire: member gone, nothing to unmute');
      }
      return;
    }

    case 'TEMPROLE_REMOVE': {
      if (!data.roleId) return;
      try {
        await client.rest.delete(Routes.guildMemberRole(data.guildId, data.userId, data.roleId), {
          reason: 'Temporary role expired',
        });
      } catch (err) {
        ignoreIfAlreadyGone(err);
        logger.info({ ...data }, 'tempActionExpire: member/role gone, nothing to remove');
      }
      return;
    }
  }
}
