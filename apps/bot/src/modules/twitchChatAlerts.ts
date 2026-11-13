import type { TwitchAlertKey } from '@refx/shared';
import { formatUptime, renderTwitchTemplate } from '../lib/twitchChat/variables';
import { redis } from '../services/redis';
import { shoutout } from './twitchChatCommands';
import type { ChannelState, ChatRuntime } from './twitchChatRuntime';

/**
 * Chat alerts: thank-you and announcement messages for Twitch events. Subs,
 * gifts, bits, raids, follows, going live and title/category changes come in
 * on the bot's own connection; hype trains, polls, predictions, charity, ad
 * breaks and channel point rewards need the broadcaster's connection.
 */

export const streamKey = (broadcasterId: string) => `twitchchat:stream:${broadcasterId}`;
export const lastOfflineKey = (broadcasterId: string) => `twitchchat:lastoffline:${broadcasterId}`;

export interface StreamRecord {
  startedAt: number;
  games: { name: string; since: number }[];
}

export async function readStreamRecord(broadcasterId: string): Promise<StreamRecord | null> {
  const raw = await redis.get(streamKey(broadcasterId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StreamRecord;
  } catch {
    return null;
  }
}

/** Remember the category for !gamesplayed (starting a record if needed). */
export async function trackGame(
  broadcasterId: string,
  game: string,
  startedAt?: number,
): Promise<void> {
  if (!game) return;
  const record = (await readStreamRecord(broadcasterId)) ?? {
    startedAt: startedAt ?? Date.now(),
    games: [],
  };
  if (record.games[record.games.length - 1]?.name !== game) {
    record.games.push({ name: game, since: Date.now() });
  }
  await redis
    .set(streamKey(broadcasterId), JSON.stringify(record), 'EX', 2 * 86_400)
    .catch(() => undefined);
}

export function describeGamesPlayed(record: StreamRecord | null, now = Date.now()): string {
  if (!record || record.games.length === 0) return '';
  return record.games
    .map((game, index) => {
      const end = record.games[index + 1]?.since ?? now;
      return `${game.name} (${formatUptime(end - game.since)})`;
    })
    .join(', ');
}

async function announce(
  rt: ChatRuntime,
  state: ChannelState,
  key: TwitchAlertKey,
  values: Record<string, string | number>,
  user?: { id: string; login: string; name: string },
): Promise<void> {
  const alert = state.config.alerts[key];
  if (!alert.enabled || !alert.message.trim()) return;
  const chatter = user ? { ...user, level: 'everyone' as const } : null;
  const message = await renderTwitchTemplate(
    alert.message,
    rt.variables(state, chatter, [], { values }),
  );
  await rt.say(state, message);
}

const TIERS: Record<string, string> = { '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3' };

interface Notification {
  notice_type: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  chatter_is_anonymous?: boolean;
  message?: { text?: string };
  sub?: { sub_tier: string; is_prime: boolean };
  resub?: {
    cumulative_months: number;
    streak_months?: number | null;
    sub_tier: string;
    is_prime: boolean;
  };
  sub_gift?: {
    recipient_user_name: string;
    sub_tier: string;
    cumulative_total?: number | null;
    community_gift_id?: string | null;
  };
  community_sub_gift?: { total: number; sub_tier: string; cumulative_total?: number | null };
}

/** channel.chat.notification: subs, resubs and gifts (no broadcaster token needed). */
export async function handleNotification(
  rt: ChatRuntime,
  state: ChannelState,
  event: Notification,
): Promise<void> {
  const user = event.chatter_is_anonymous
    ? { id: '', login: 'anonymous', name: 'An anonymous gifter' }
    : { id: event.chatter_user_id, login: event.chatter_user_login, name: event.chatter_user_name };
  const message = event.message?.text ?? '';
  switch (event.notice_type) {
    case 'sub':
      if (!event.sub) return;
      await announce(
        rt,
        state,
        'sub',
        { tier: event.sub.is_prime ? 'Prime' : (TIERS[event.sub.sub_tier] ?? 'Tier 1'), message },
        user,
      );
      return;
    case 'resub':
      if (!event.resub) return;
      await announce(
        rt,
        state,
        'resub',
        {
          months: event.resub.cumulative_months,
          streak: event.resub.streak_months ?? '',
          tier: event.resub.is_prime ? 'Prime' : (TIERS[event.resub.sub_tier] ?? 'Tier 1'),
          message,
        },
        user,
      );
      return;
    case 'sub_gift':
      // Part of a gift bomb: the community_sub_gift alert covers it.
      if (!event.sub_gift || event.sub_gift.community_gift_id) return;
      await announce(
        rt,
        state,
        'giftsub',
        {
          recipient: event.sub_gift.recipient_user_name,
          tier: TIERS[event.sub_gift.sub_tier] ?? 'Tier 1',
          total: event.sub_gift.cumulative_total ?? '',
        },
        user,
      );
      return;
    case 'community_sub_gift':
      if (!event.community_sub_gift) return;
      await announce(
        rt,
        state,
        'giftbomb',
        {
          amount: event.community_sub_gift.total,
          tier: TIERS[event.community_sub_gift.sub_tier] ?? 'Tier 1',
          total: event.community_sub_gift.cumulative_total ?? '',
        },
        user,
      );
  }
}

export async function handleBits(
  rt: ChatRuntime,
  state: ChannelState,
  user: { id: string; login: string; name: string },
  bits: number,
  message: string,
): Promise<void> {
  if (bits < state.config.alertOptions.minBits) return;
  await announce(
    rt,
    state,
    'bits',
    { bits, message: message.replace(/\bcheer\d+\b/gi, '').trim() },
    user,
  );
}

/** Events that arrive as their own EventSub subscription types. */
export async function handleChannelEvent(
  rt: ChatRuntime,
  state: ChannelState,
  type: string,
  event: Record<string, unknown>,
): Promise<void> {
  const str = (key: string) => (typeof event[key] === 'string' ? (event[key] as string) : '');
  const num = (key: string) => (typeof event[key] === 'number' ? (event[key] as number) : 0);

  switch (type) {
    case 'channel.follow': {
      const id = str('user_id');
      if (!id || state.thanked.has(id)) return;
      state.thanked.add(id);
      await announce(
        rt,
        state,
        'follow',
        {},
        { id, login: str('user_login'), name: str('user_name') },
      );
      return;
    }
    case 'channel.raid': {
      const viewers = num('viewers');
      if (viewers < state.config.alertOptions.minRaidViewers) return;
      const raider = {
        id: str('from_broadcaster_user_id'),
        login: str('from_broadcaster_user_login'),
        name: str('from_broadcaster_user_name'),
      };
      await announce(rt, state, 'raid', { viewers }, raider);
      if (state.config.alertOptions.autoShoutoutRaids && raider.login) {
        await shoutout(rt, state, raider.login);
      }
      return;
    }
    case 'stream.online': {
      state.live = true;
      state.stream = null;
      state.thanked.clear();
      const startedAt = Date.parse(str('started_at')) || Date.now();
      await redis.del(streamKey(state.broadcasterId)).catch(() => undefined);
      const info = await rt.channel(state);
      if (info?.game_name) await trackGame(state.broadcasterId, info.game_name, startedAt);
      await announce(rt, state, 'live', { title: info?.title ?? '', game: info?.game_name ?? '' });
      return;
    }
    case 'stream.offline': {
      const record = await readStreamRecord(state.broadcasterId);
      state.live = false;
      state.stream = null;
      await redis
        .set(lastOfflineKey(state.broadcasterId), String(Date.now()))
        .catch(() => undefined);
      await announce(rt, state, 'offline', {
        uptime: record ? formatUptime(Date.now() - record.startedAt) : '',
      });
      return;
    }
    case 'channel.update': {
      const before = state.channelInfo?.value;
      const title = str('title');
      const game = str('category_name');
      state.channelInfo = null;
      if (game && state.live) await trackGame(state.broadcasterId, game);
      if (before && title && before.title !== title)
        await announce(rt, state, 'titleChange', { title });
      if (before && game && before.game_name !== game)
        await announce(rt, state, 'gameChange', { game });
      return;
    }
    case 'channel.hype_train.begin':
      await announce(rt, state, 'hypeTrainBegin', { level: num('level') || 1 });
      return;
    case 'channel.hype_train.end':
      await announce(rt, state, 'hypeTrainEnd', { level: num('level') });
      return;
    case 'channel.poll.begin': {
      const choices = (event.choices as { title: string }[] | undefined) ?? [];
      await announce(rt, state, 'pollBegin', {
        title: str('title'),
        choices: choices.map((c) => c.title).join(', '),
      });
      return;
    }
    case 'channel.poll.end': {
      if (str('status') !== 'completed') return;
      const choices = (event.choices as { title: string; votes?: number }[] | undefined) ?? [];
      const winner = [...choices].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
      await announce(rt, state, 'pollEnd', { title: str('title'), winner: winner?.title ?? '' });
      return;
    }
    case 'channel.prediction.begin': {
      const outcomes = (event.outcomes as { title: string }[] | undefined) ?? [];
      await announce(rt, state, 'predictionBegin', {
        title: str('title'),
        outcomes: outcomes.map((o) => o.title).join(' vs '),
      });
      return;
    }
    case 'channel.prediction.lock':
      await announce(rt, state, 'predictionLock', { title: str('title') });
      return;
    case 'channel.prediction.end': {
      if (str('status') !== 'resolved') return;
      const outcomes = (event.outcomes as { id: string; title: string }[] | undefined) ?? [];
      const winner = outcomes.find((o) => o.id === str('winning_outcome_id'));
      await announce(rt, state, 'predictionEnd', {
        title: str('title'),
        winner: winner?.title ?? '',
      });
      return;
    }
    case 'channel.charity_campaign.donate': {
      const amount = event.amount as
        { value: number; decimal_places: number; currency: string } | undefined;
      const value = amount
        ? `${(amount.value / 10 ** amount.decimal_places).toFixed(amount.decimal_places)} ${amount.currency}`
        : '';
      await announce(
        rt,
        state,
        'charity',
        { amount: value, charity: str('charity_name') },
        {
          id: str('user_id'),
          login: str('user_login'),
          name: str('user_name'),
        },
      );
      return;
    }
    case 'channel.ad_break.begin':
      await announce(rt, state, 'adBreak', { duration: num('duration_seconds') });
      return;
    case 'channel.channel_points_custom_reward_redemption.add': {
      const reward = event.reward as { title?: string } | undefined;
      await announce(
        rt,
        state,
        'reward',
        { reward: reward?.title ?? '', input: str('user_input') },
        {
          id: str('user_id'),
          login: str('user_login'),
          name: str('user_name'),
        },
      );
    }
  }
}

/** EventSub subscriptions per channel: [type, version, condition]. */
export function botSubscriptions(
  broadcasterId: string,
  botId: string,
): [string, string, Record<string, string>][] {
  return [
    ['channel.chat.message', '1', { broadcaster_user_id: broadcasterId, user_id: botId }],
    ['channel.chat.notification', '1', { broadcaster_user_id: broadcasterId, user_id: botId }],
    ['channel.follow', '2', { broadcaster_user_id: broadcasterId, moderator_user_id: botId }],
    ['channel.raid', '1', { to_broadcaster_user_id: broadcasterId }],
    ['channel.update', '2', { broadcaster_user_id: broadcasterId }],
    ['stream.online', '1', { broadcaster_user_id: broadcasterId }],
    ['stream.offline', '1', { broadcaster_user_id: broadcasterId }],
  ];
}

export function broadcasterSubscriptions(
  broadcasterId: string,
): [string, string, Record<string, string>][] {
  const condition = { broadcaster_user_id: broadcasterId };
  return [
    ['channel.hype_train.begin', '2', condition],
    ['channel.hype_train.end', '2', condition],
    ['channel.poll.begin', '1', condition],
    ['channel.poll.end', '1', condition],
    ['channel.prediction.begin', '1', condition],
    ['channel.prediction.lock', '1', condition],
    ['channel.prediction.end', '1', condition],
    ['channel.charity_campaign.donate', '1', condition],
    ['channel.ad_break.begin', '1', condition],
    ['channel.channel_points_custom_reward_redemption.add', '1', condition],
  ];
}
