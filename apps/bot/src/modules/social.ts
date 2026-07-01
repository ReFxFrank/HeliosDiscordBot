import { type Client } from 'discord.js';
import { prisma } from '@solari/database';
import { QUEUE_NAMES } from '@solari/jobs';
import { env } from '../env';
import { brandedEmbed } from '../lib/embeds';
import { fetchLatest, type SocialItem, type SocialPlatform } from '../lib/social';
import type { JobService } from '../services/jobs';
import type { Logger } from '../logger';

/** Poll interval per subscription. Modest to respect upstream rate limits. */
const POLL_INTERVAL_MS = 3 * 60 * 1000;
/** Never post more than this many items from a single poll (anti-spam). */
const MAX_POST_PER_POLL = 5;

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  reddit: 'Reddit',
  rss: 'RSS',
};

/** BullMQ scheduler id — colon-free (BullMQ rejects ':' in custom ids). */
function schedulerId(subscriptionId: string): string {
  return `social-${subscriptionId}`;
}

/** Arm the repeating poll for a subscription (idempotent — safe to re-call). */
export async function scheduleSocialPoll(jobs: JobService, subscriptionId: string): Promise<void> {
  await jobs.scheduleRecurring(
    QUEUE_NAMES.socialPoll,
    schedulerId(subscriptionId),
    POLL_INTERVAL_MS,
    'poll',
    { subscriptionId },
  );
}

export async function cancelSocialPoll(jobs: JobService, subscriptionId: string): Promise<void> {
  await jobs.cancelRecurring(QUEUE_NAMES.socialPoll, schedulerId(subscriptionId));
}

/**
 * Record the current newest item as the baseline (on /social add) so the first
 * real poll doesn't dump the whole existing feed into the channel.
 */
export async function baselineSubscription(subscriptionId: string): Promise<void> {
  const sub = await prisma.socialSubscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return;
  const items = await fetchLatest(sub.platform as SocialPlatform, sub.target, env);
  const newest = items[0];
  if (newest) {
    await prisma.socialSubscription.update({ where: { id: sub.id }, data: { lastItemId: newest.id } });
  }
}

interface PollDeps {
  client: Client;
  logger: Logger;
  jobs: JobService;
}

/** Poll one subscription and post any new items. Cadence is owned by the scheduler. */
export async function pollSubscription(subscriptionId: string, deps: PollDeps): Promise<void> {
  const sub = await prisma.socialSubscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) {
    // Subscription gone but a stale scheduler fired — remove it.
    await cancelSocialPoll(deps.jobs, subscriptionId);
    return;
  }

  // Job context has no ConfigCache, so check enablement directly. When disabled
  // the scheduler keeps ticking idle, so re-enabling takes effect without a restart.
  const cfg = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId: sub.guildId, module: 'SOCIAL' } },
    select: { enabled: true },
  });
  if (!cfg?.enabled) return;

  try {
    const items = await fetchLatest(sub.platform as SocialPlatform, sub.target, env);
    if (items.length === 0) return;
    const newest = items[0];
    if (!newest) return;

    // Twitch is a live/offline STATE, not a feed: post when the id (started_at)
    // changes — a genuine new go-live, including after an offline gap.
    if (sub.platform === 'twitch') {
      if (newest.id !== sub.lastItemId) {
        await postItems(deps, sub, [newest]);
        await updateLastItem(sub.id, newest.id);
      }
      return;
    }

    // Feed platforms (youtube/reddit/rss): dedup against lastItemId.
    if (!sub.lastItemId) {
      await updateLastItem(sub.id, newest.id); // anchor only; post nothing (no backlog dump)
      return;
    }
    const seenIndex = items.findIndex((i) => i.id === sub.lastItemId);
    if (seenIndex === -1) {
      // Anchor aged out of the window / was deleted — can't tell new from old, so
      // re-anchor and post nothing rather than reposting already-seen items.
      if (newest.id !== sub.lastItemId) await updateLastItem(sub.id, newest.id);
      return;
    }
    const freshNewestFirst = items.slice(0, seenIndex);
    if (freshNewestFirst.length === 0) return;
    // Post oldest-first, at most MAX per poll; advance the anchor only to the
    // newest item actually posted so a large burst isn't silently skipped.
    const batch = [...freshNewestFirst].reverse().slice(0, MAX_POST_PER_POLL);
    await postItems(deps, sub, batch);
    const newestPosted = batch[batch.length - 1];
    if (newestPosted) await updateLastItem(sub.id, newestPosted.id);
  } catch (err) {
    deps.logger.warn({ err, subscriptionId }, 'Social poll failed');
  }
}

async function updateLastItem(id: string, lastItemId: string): Promise<void> {
  await prisma.socialSubscription.update({ where: { id }, data: { lastItemId } });
}

async function postItems(
  deps: PollDeps,
  sub: { channelId: string; mentionRoleId: string | null; platform: string },
  itemsOldestFirst: SocialItem[],
): Promise<void> {
  const channel =
    deps.client.channels.cache.get(sub.channelId) ??
    (await deps.client.channels.fetch(sub.channelId).catch(() => null));
  if (!channel?.isTextBased() || channel.isDMBased()) return;

  const mention = sub.mentionRoleId ? `<@&${sub.mentionRoleId}>` : undefined;
  for (const item of itemsOldestFirst) {
    const embed = brandedEmbed({ kind: 'info' })
      .setTitle(item.title.slice(0, 256))
      .setAuthor({
        name: `${PLATFORM_LABEL[sub.platform as SocialPlatform]}${item.author ? ` • ${item.author}` : ''}`,
      });
    if (item.url) embed.setURL(item.url);
    await channel
      .send({
        content: mention,
        embeds: [embed],
        allowedMentions: { roles: sub.mentionRoleId ? [sub.mentionRoleId] : [] },
      })
      .catch(() => undefined);
  }
}

/** Re-arm every subscription's poll scheduler on startup (idempotent upsert). */
export async function reconcileSocial(
  client: Client,
  jobs: JobService,
  logger: Logger,
): Promise<void> {
  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length === 0) return;
  const subs = await prisma.socialSubscription.findMany({
    where: { guildId: { in: guildIds } },
    select: { id: true },
  });
  for (const sub of subs) {
    await scheduleSocialPoll(jobs, sub.id);
  }
  logger.info({ count: subs.length }, 'Reconciled social subscriptions');
}
