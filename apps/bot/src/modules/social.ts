import { AttachmentBuilder, type Client } from 'discord.js';
import { prisma } from '@refx/database';
import { QUEUE_NAMES } from '@refx/jobs';
import { renderSocialMessage, type SocialMessageVars } from '@refx/shared';
import { env } from '../env';
import { brandedEmbed } from '../lib/embeds';
import { fetchLatest, fetchTwitchState, type SocialItem, type SocialPlatform } from '../lib/social';
import {
  buildTwitchEndedEmbed,
  buildTwitchLiveEmbed,
  buildTwitchWatchRow,
} from '../lib/twitchAlert';
import { downloadTikTokCover, fetchTikTokVideos, isNewerTikTok } from '../lib/tiktok';
import { buildTikTokVideoEmbed, buildTikTokWatchRow } from '../lib/tiktokAlert';
import type { JobService } from '../services/jobs';
import type { Logger } from '../logger';

/** Poll interval per subscription. Modest to respect upstream rate limits. */
const POLL_INTERVAL_MS = 3 * 60 * 1000;
/** Never post more than this many items from a single poll (anti-spam). */
const MAX_POST_PER_POLL = 5;

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  bluesky: 'Bluesky',
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
  if (sub.platform === 'tiktok') {
    // '0' marks "read, but no videos yet", so the very first upload still posts.
    const videos = await fetchTikTokVideos(sub.target);
    if (videos) await updateLastItem(sub.id, videos[0]?.id ?? TIKTOK_EMPTY_ANCHOR);
    return;
  }
  const items = await fetchLatest(sub.platform as SocialPlatform, sub.target, env);
  const newest = items[0];
  if (newest) {
    await prisma.socialSubscription.update({
      where: { id: sub.id },
      data: { lastItemId: newest.id },
    });
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
    // Twitch is a live/offline STATE, not a feed, and has its own alert lifecycle.
    if (sub.platform === 'twitch') {
      await pollTwitch(deps, sub);
      return;
    }
    if (sub.platform === 'tiktok') {
      await pollTikTok(deps, sub);
      return;
    }

    const items = await fetchLatest(sub.platform as SocialPlatform, sub.target, env);
    if (items.length === 0) return;
    const newest = items[0];
    if (!newest) return;

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

type Subscription = NonNullable<Awaited<ReturnType<typeof prisma.socialSubscription.findUnique>>>;

async function alertChannel(client: Client, channelId: string) {
  const channel =
    client.channels.cache.get(channelId) ??
    (await client.channels.fetch(channelId).catch(() => null));
  return channel?.isTextBased() && !channel.isDMBased() ? channel : null;
}

/**
 * The text sent above an alert's embed: the custom message when one is set
 * (with its placeholders filled), otherwise just the role ping. Only the
 * configured role can ever be pinged, whatever the message contains.
 */
function alertContent(
  sub: Pick<Subscription, 'message' | 'mentionRoleId'>,
  vars: Omit<SocialMessageVars, 'role'>,
) {
  const role = sub.mentionRoleId ? `<@&${sub.mentionRoleId}>` : '';
  const content = sub.message ? renderSocialMessage(sub.message, { ...vars, role }) : role;
  return {
    content: content || undefined,
    allowedMentions: { parse: [], roles: sub.mentionRoleId ? [sub.mentionRoleId] : [] },
  };
}

async function postItems(
  deps: PollDeps,
  sub: Subscription,
  itemsOldestFirst: SocialItem[],
): Promise<void> {
  const channel = await alertChannel(deps.client, sub.channelId);
  if (!channel) return;

  for (const item of itemsOldestFirst) {
    const embed = brandedEmbed({ kind: 'info' })
      .setTitle(item.title.slice(0, 256))
      .setAuthor({
        name: `${PLATFORM_LABEL[sub.platform as SocialPlatform]}${item.author ? ` • ${item.author}` : ''}`,
      });
    if (item.url) embed.setURL(item.url);
    await channel
      .send({
        ...alertContent(sub, {
          streamer: item.author ?? '',
          title: item.title,
          game: '',
          url: item.url,
        }),
        embeds: [embed],
      })
      .catch(() => undefined);
  }
}

// ── Twitch: one alert message per broadcast ─────────────────────────────────

/** Consecutive "offline" polls before a live alert is closed (Twitch's API
 *  briefly reports nothing during ad breaks and reconnects). */
const OFFLINE_POLLS_BEFORE_END = 2;
const offlinePolls = new Map<string, number>();

/** Give or take the live role (needs both a role and the streamer's member). */
async function setLiveRole(deps: PollDeps, sub: Subscription, live: boolean): Promise<void> {
  if (!sub.liveRoleId || !sub.liveUserId) return;
  const guild = deps.client.guilds.cache.get(sub.guildId);
  const member = await guild?.members.fetch(sub.liveUserId).catch(() => null);
  if (!member) return;
  const change = live
    ? member.roles.add(sub.liveRoleId, 'Twitch stream went live')
    : member.roles.remove(sub.liveRoleId, 'Twitch stream ended');
  await change.catch((err: unknown) =>
    deps.logger.warn({ err, subscriptionId: sub.id }, 'Live role update failed'),
  );
}

/** Rewrite the stream's alert into its "ended" form and stop tracking it. */
async function endTwitchAlert(deps: PollDeps, sub: Subscription): Promise<void> {
  offlinePolls.delete(sub.id);
  if (sub.liveMessageId) {
    const channel = await alertChannel(deps.client, sub.channelId);
    const message = await channel?.messages.fetch(sub.liveMessageId).catch(() => null);
    const live = message?.embeds[0];
    if (message && live) {
      await message
        .edit({ embeds: [buildTwitchEndedEmbed(live.toJSON(), sub.lastItemId)] })
        .catch(() => undefined);
    }
  }
  await setLiveRole(deps, sub, false);
  await prisma.socialSubscription.update({ where: { id: sub.id }, data: { liveMessageId: null } });
}

async function pollTwitch(deps: PollDeps, sub: Subscription): Promise<void> {
  const state = await fetchTwitchState(sub.target, env);
  // Couldn't reach Twitch: change nothing, try again next poll.
  if (state.status === 'unknown') return;

  if (state.status === 'offline') {
    if (!sub.liveMessageId) return;
    const misses = (offlinePolls.get(sub.id) ?? 0) + 1;
    if (misses < OFFLINE_POLLS_BEFORE_END) offlinePolls.set(sub.id, misses);
    else await endTwitchAlert(deps, sub);
    return;
  }

  offlinePolls.delete(sub.id);
  const { stream } = state;
  const channel = await alertChannel(deps.client, sub.channelId);

  // Same broadcast as last poll: refresh the preview frame and viewer count.
  if (stream.startedAt === sub.lastItemId) {
    if (!sub.liveMessageId || !channel) return;
    const message = await channel.messages.fetch(sub.liveMessageId).catch(() => null);
    if (!message) {
      // Staff deleted the alert; stop editing it (the role still clears at the end).
      await prisma.socialSubscription.update({
        where: { id: sub.id },
        data: { liveMessageId: null },
      });
      return;
    }
    await message.edit({ embeds: [buildTwitchLiveEmbed(stream)] }).catch(() => undefined);
    return;
  }

  // A new broadcast. Close the previous alert first if it never saw "offline".
  if (sub.liveMessageId) await endTwitchAlert(deps, sub);
  const sent = channel
    ? await channel
        .send({
          ...alertContent(sub, {
            streamer: stream.userName,
            title: stream.title,
            game: stream.game,
            url: stream.url,
          }),
          embeds: [buildTwitchLiveEmbed(stream)],
          components: [buildTwitchWatchRow(stream.url)],
        })
        .catch((err: unknown) => {
          deps.logger.warn({ err, subscriptionId: sub.id }, 'Twitch alert post failed');
          return null;
        })
    : null;
  await prisma.socialSubscription.update({
    where: { id: sub.id },
    data: { lastItemId: stream.startedAt, liveMessageId: sent?.id ?? null },
  });
  await setLiveRole(deps, sub, true);
}

// ── TikTok: new videos, compared by (time-ordered) id ───────────────────────

const TIKTOK_EMPTY_ANCHOR = '0';

async function pollTikTok(deps: PollDeps, sub: Subscription): Promise<void> {
  const videos = await fetchTikTokVideos(sub.target);
  // Couldn't read TikTok: change nothing, try again next poll.
  if (!videos) return;
  if (!sub.lastItemId) {
    // First successful read: remember where the account is, post nothing.
    await updateLastItem(sub.id, videos[0]?.id ?? TIKTOK_EMPTY_ANCHOR);
    return;
  }
  const anchor = sub.lastItemId;
  const fresh = videos
    .filter((video) => isNewerTikTok(video.id, anchor))
    .reverse() // oldest first
    .slice(0, MAX_POST_PER_POLL);
  if (fresh.length === 0) return;

  const channel = await alertChannel(deps.client, sub.channelId);
  if (!channel) return;
  for (const video of fresh) {
    const cover = video.coverUrl ? await downloadTikTokCover(video.coverUrl) : null;
    const coverName = cover ? `tiktok-${video.id}.${cover.extension}` : null;
    await channel
      .send({
        ...alertContent(sub, {
          streamer: video.authorName,
          title: video.description.split('\n')[0] ?? '',
          game: '',
          url: video.url,
        }),
        embeds: [buildTikTokVideoEmbed(video, coverName)],
        components: [buildTikTokWatchRow(video.url)],
        files: cover && coverName ? [new AttachmentBuilder(cover.data, { name: coverName })] : [],
      })
      .catch((err: unknown) =>
        deps.logger.warn({ err, subscriptionId: sub.id }, 'TikTok alert post failed'),
      );
  }
  const newest = fresh[fresh.length - 1];
  if (newest) await updateLastItem(sub.id, newest.id);
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
