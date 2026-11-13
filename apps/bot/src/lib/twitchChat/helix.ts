import {
  TWITCH_BOT_ACCOUNT_ID,
  freshTwitchAccount,
  refreshTwitchAccount,
  type PrismaClient,
  type TwitchAccountTokens,
} from '@refx/database';

/**
 * Twitch Helix API as one of the instance's connected accounts: the chat bot
 * ("bot", a moderator in the channel) or a broadcaster ("broadcaster:<id>",
 * needed for subs/bits/hype/poll alerts and !settitle / !setgame).
 */

export const broadcasterAccountId = (twitchUserId: string) => `broadcaster:${twitchUserId}`;

export interface HelixResult<T> {
  status: number;
  data: T | null;
  message?: string;
}

export interface HelixUser {
  id: string;
  login: string;
  display_name: string;
  created_at?: string;
  profile_image_url?: string;
}

export interface HelixStream {
  id: string;
  started_at: string;
  game_name: string;
  title: string;
  viewer_count: number;
}

export interface HelixChannel {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  game_id: string;
  game_name: string;
  title: string;
}

type Query = Record<string, string | string[] | undefined>;

export class TwitchHelix {
  constructor(
    private readonly db: PrismaClient,
    readonly accountId: string = TWITCH_BOT_ACCOUNT_ID,
  ) {}

  /** The connected account, refreshed if near expiry; null if none. */
  account(): Promise<TwitchAccountTokens | null> {
    return freshTwitchAccount(this.db, this.accountId);
  }

  async request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT',
    path: string,
    options: { query?: Query; body?: unknown } = {},
  ): Promise<HelixResult<T>> {
    const clientId = process.env.TWITCH_CLIENT_ID;
    let account = await this.account();
    if (!account || !clientId) return { status: 0, data: null, message: 'Not connected' };

    const url = new URL(`https://api.twitch.tv/helix${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: {
            'Client-Id': clientId,
            Authorization: `Bearer ${account.accessToken}`,
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        return {
          status: 0,
          data: null,
          message: err instanceof Error ? err.message : 'fetch failed',
        };
      }
      if (res.status === 401 && attempt === 0) {
        // Token revoked or expired early: refresh once and retry.
        const refreshed = await refreshTwitchAccount(this.db, this.accountId);
        if (!refreshed) return { status: 401, data: null, message: 'Account needs reconnecting' };
        account = refreshed;
        continue;
      }
      if (res.status === 204) return { status: 204, data: null };
      const json = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
      return { status: res.status, data: res.ok ? json : null, message: json?.message };
    }
    return { status: 401, data: null, message: 'Unauthorized' };
  }

  // ── Users & channels ──────────────────────────────────────────────────────

  async usersByLogin(logins: string[]): Promise<HelixUser[]> {
    const clean = logins.map((l) => l.replace(/^@/, '').toLowerCase()).filter(Boolean);
    if (clean.length === 0) return [];
    const res = await this.request<{ data: HelixUser[] }>('GET', '/users', {
      query: { login: clean.slice(0, 100) },
    });
    return res.data?.data ?? [];
  }

  async usersById(ids: string[]): Promise<HelixUser[]> {
    if (ids.length === 0) return [];
    const res = await this.request<{ data: HelixUser[] }>('GET', '/users', {
      query: { id: ids.slice(0, 100) },
    });
    return res.data?.data ?? [];
  }

  /** Live stream info, or null when offline; undefined when Twitch failed. */
  async stream(userId: string): Promise<HelixStream | null | undefined> {
    const res = await this.request<{ data: HelixStream[] }>('GET', '/streams', {
      query: { user_id: userId },
    });
    if (!res.data) return undefined;
    return res.data.data[0] ?? null;
  }

  async channel(userId: string): Promise<HelixChannel | null> {
    const res = await this.request<{ data: HelixChannel[] }>('GET', '/channels', {
      query: { broadcaster_id: userId },
    });
    return res.data?.data[0] ?? null;
  }

  /** Change title and/or category (broadcaster token). */
  async modifyChannel(
    broadcasterId: string,
    patch: { title?: string; game_id?: string },
  ): Promise<boolean> {
    const res = await this.request('PATCH', '/channels', {
      query: { broadcaster_id: broadcasterId },
      body: patch,
    });
    return res.status === 204;
  }

  async searchCategory(name: string): Promise<{ id: string; name: string } | null> {
    const res = await this.request<{ data: { id: string; name: string }[] }>(
      'GET',
      '/search/categories',
      { query: { query: name, first: '5' } },
    );
    const list = res.data?.data ?? [];
    return list.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? list[0] ?? null;
  }

  /** When `userId` followed, null if they don't; undefined when Twitch failed. */
  async followedAt(broadcasterId: string, userId: string): Promise<Date | null | undefined> {
    const res = await this.request<{ data: { followed_at: string }[] }>(
      'GET',
      '/channels/followers',
      { query: { broadcaster_id: broadcasterId, user_id: userId } },
    );
    if (!res.data) return undefined;
    const at = res.data.data[0]?.followed_at;
    return at ? new Date(at) : null;
  }

  async followerCount(broadcasterId: string): Promise<number | null> {
    const res = await this.request<{ total: number }>('GET', '/channels/followers', {
      query: { broadcaster_id: broadcasterId, first: '1' },
    });
    return res.data?.total ?? null;
  }

  /** Subscriber count (broadcaster token). */
  async subscriberCount(broadcasterId: string): Promise<number | null> {
    const res = await this.request<{ total: number }>('GET', '/subscriptions', {
      query: { broadcaster_id: broadcasterId, first: '1' },
    });
    return res.data?.total ?? null;
  }

  /** People in chat (up to 1000 sampled) and the total. */
  async chatters(
    broadcasterId: string,
    moderatorId: string,
  ): Promise<{ total: number; logins: string[] } | null> {
    const res = await this.request<{ data: { user_login: string }[]; total: number }>(
      'GET',
      '/chat/chatters',
      { query: { broadcaster_id: broadcasterId, moderator_id: moderatorId, first: '1000' } },
    );
    if (!res.data) return null;
    return { total: res.data.total, logins: res.data.data.map((c) => c.user_login) };
  }

  /** Channels where the bot account is a moderator. */
  async moderatedChannelIds(botId: string): Promise<Set<string> | null> {
    const ids = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await this.request<{
        data: { broadcaster_id: string }[];
        pagination?: { cursor?: string };
      }>('GET', '/moderation/channels', {
        query: { user_id: botId, first: '100', after: cursor },
      });
      if (!res.data) return null;
      for (const row of res.data.data) ids.add(row.broadcaster_id);
      cursor = res.data.pagination?.cursor;
      if (!cursor) break;
    }
    return ids;
  }

  async channelEmotes(broadcasterId: string): Promise<string[]> {
    const res = await this.request<{ data: { name: string }[] }>('GET', '/chat/emotes', {
      query: { broadcaster_id: broadcasterId },
    });
    return (res.data?.data ?? []).map((e) => e.name);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  async sendMessage(
    broadcasterId: string,
    senderId: string,
    message: string,
    replyTo?: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const res = await this.request<{
      data: { is_sent: boolean; drop_reason?: { message?: string } | null }[];
    }>('POST', '/chat/messages', {
      body: {
        broadcaster_id: broadcasterId,
        sender_id: senderId,
        message: message.slice(0, 500),
        ...(replyTo ? { reply_parent_message_id: replyTo } : {}),
      },
    });
    const result = res.data?.data[0];
    if (!result) return { ok: false, reason: res.message ?? `HTTP ${res.status}` };
    return result.is_sent
      ? { ok: true }
      : { ok: false, reason: result.drop_reason?.message ?? 'dropped' };
  }

  /** Whisper (the bot account needs a verified phone number). */
  async whisper(fromId: string, toId: string, message: string): Promise<boolean> {
    const res = await this.request('POST', '/whispers', {
      query: { from_user_id: fromId, to_user_id: toId },
      body: { message: message.slice(0, 500) },
    });
    return res.status === 204;
  }

  async deleteMessage(
    broadcasterId: string,
    moderatorId: string,
    messageId: string,
  ): Promise<boolean> {
    const res = await this.request('DELETE', '/moderation/chat', {
      query: { broadcaster_id: broadcasterId, moderator_id: moderatorId, message_id: messageId },
    });
    return res.status === 204;
  }

  /** Time out (seconds) or ban (seconds = null). */
  async ban(
    broadcasterId: string,
    moderatorId: string,
    userId: string,
    seconds: number | null,
    reason: string,
  ): Promise<boolean> {
    const res = await this.request('POST', '/moderation/bans', {
      query: { broadcaster_id: broadcasterId, moderator_id: moderatorId },
      body: {
        data: {
          user_id: userId,
          ...(seconds !== null ? { duration: Math.max(1, Math.min(1_209_600, seconds)) } : {}),
          reason: reason.slice(0, 500),
        },
      },
    });
    return res.status === 200;
  }

  async unban(broadcasterId: string, moderatorId: string, userId: string): Promise<boolean> {
    const res = await this.request('DELETE', '/moderation/bans', {
      query: { broadcaster_id: broadcasterId, moderator_id: moderatorId, user_id: userId },
    });
    return res.status === 204;
  }

  async shoutout(fromId: string, toId: string, moderatorId: string): Promise<HelixResult<unknown>> {
    return this.request('POST', '/chat/shoutouts', {
      query: { from_broadcaster_id: fromId, to_broadcaster_id: toId, moderator_id: moderatorId },
    });
  }

  /** Create a clip; returns its URL once Twitch has made it. */
  async createClip(broadcasterId: string): Promise<string | null> {
    const res = await this.request<{ data: { id: string }[] }>('POST', '/clips', {
      query: { broadcaster_id: broadcasterId },
    });
    const id = res.data?.data[0]?.id;
    return id ? `https://clips.twitch.tv/${id}` : null;
  }

  async subscribe(
    type: string,
    version: string,
    condition: Record<string, string>,
    sessionId: string,
  ): Promise<HelixResult<{ data: { id: string; status: string }[] }>> {
    return this.request('POST', '/eventsub/subscriptions', {
      body: { type, version, condition, transport: { method: 'websocket', session_id: sessionId } },
    });
  }
}
