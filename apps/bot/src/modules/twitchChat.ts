import { TWITCH_BOT_ACCOUNT_ID, prisma } from '@refx/database';
import {
  TWITCH_BOT_SCOPES,
  TWITCH_BROADCASTER_SCOPES,
  type TwitchChatConfig,
  type TwitchResponseType,
} from '@refx/shared';
import type { BotContext } from '../framework/context';
import { EventSubSocket } from '../lib/twitchChat/eventsub';
import {
  bttvEmotes,
  dadJoke,
  customApi,
  ffzEmotes,
  latestMastodon,
  latestTikTok,
  latestYouTube,
  lastFm,
  leagueRank,
  randomFact,
  sevenTvEmotes,
  tftRank,
  valorantRank,
  weather,
} from '../lib/twitchChat/external';
import { compileBlockedTerms } from '../lib/twitchChat/filters';
import {
  TwitchHelix,
  broadcasterAccountId,
  type HelixChannel,
  type HelixStream,
} from '../lib/twitchChat/helix';
import { compileKeywords } from '../lib/twitchChat/keywords';
import { ChatHistory, parseNuke } from '../lib/twitchChat/nuke';
import {
  formatDate,
  formatFollowAge,
  formatSpan,
  formatUptime,
  renderTwitchTemplate,
  stripAt,
  touser,
  type VariableContext,
} from '../lib/twitchChat/variables';
import { subscriber, redis } from '../services/redis';
import {
  botSubscriptions,
  broadcasterSubscriptions,
  describeGamesPlayed,
  handleBits,
  handleChannelEvent,
  handleNotification,
  lastOfflineKey,
  readStreamRecord,
  trackGame,
} from './twitchChatAlerts';
import { handleChatMessage, runNuke, shoutout } from './twitchChatCommands';
import {
  addCounter,
  findQuote,
  formatQuote,
  getCounter,
  pruneModLog,
  writeModLog,
  type ModLogEntry,
} from './twitchChatData';
import type { ChannelState, ChatEvent, ChatRuntime, Chatter } from './twitchChatRuntime';

/**
 * The Twitch chat bot (TWITCH_CHAT module). One EventSub WebSocket as the bot
 * account for every configured channel (chat, subs, follows, raids, live,
 * title changes), plus one per connected broadcaster for the events only they
 * can grant (hype trains, polls, predictions, charity, ads, rewards). Status
 * is written to Redis for the dashboard; the dashboard sends nukes and
 * rollbacks back over Redis.
 */

export const twitchChatStatusKey = (guildId: string) => `twitchchat:status:${guildId}`;
export const TWITCH_COMMAND_CHANNEL = 'twitchchat:command';
export const twitchCommandResultKey = (requestId: string) => `twitchchat:result:${requestId}`;

const SYNC_INTERVAL_MS = 2 * 60_000;
const TIMER_TICK_MS = 30_000;
const STREAM_CACHE_MS = 60_000;
/** Twitch allows a moderator 100 messages per 30s; stay well under. */
const SEND_LIMIT = 40;
const SEND_WINDOW_MS = 30_000;

export interface TwitchChatStatus {
  checkedAt: string;
  botLogin: string | null;
  channel: string | null;
  connected: boolean;
  isModerator: boolean | null;
  live: boolean;
  /** The bot account is missing permissions added since it was connected. */
  botNeedsReconnect: boolean;
  broadcaster: 'connected' | 'missing' | 'needs-reconnect';
  problem: string | null;
}

export class TwitchChatService implements ChatRuntime {
  readonly helix: TwitchHelix;
  readonly startedAt = Date.now();
  bot = { id: '', login: '' };
  private botScopes: string[] = [];
  private readonly socket: EventSubSocket;
  private readonly ownerSockets = new Map<string, EventSubSocket>();
  private readonly ownerHelix = new Map<string, TwitchHelix>();
  private readonly ownerSubscribed = new Set<string>();
  private channels = new Map<string, ChannelState>();
  private subscribed = new Set<string>();
  private readonly subscribeErrors = new Map<string, string>();
  private syncTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private syncing: Promise<void> | null = null;
  private resyncQueued = false;
  private readonly sent: number[] = [];
  private lastPrune = 0;

  constructor(readonly ctx: BotContext) {
    this.helix = new TwitchHelix(ctx.prisma);
    this.socket = new EventSubSocket(
      {
        onSession: (sessionId, migrated) => this.onBotSession(sessionId, migrated),
        onNotification: (type, event) => this.onEvent(type, event as Record<string, unknown>),
        onRevoked: (type, status, condition) => {
          this.ctx.logger.warn({ type, status, condition }, 'Twitch subscription revoked');
          const id = condition.broadcaster_user_id ?? condition.to_broadcaster_user_id;
          if (id) this.subscribed.delete(id);
        },
      },
      ctx.logger,
    );
  }

  start(): void {
    this.ctx.config.onUpdate((_guildId, module) => {
      if (module === 'TWITCH_CHAT') this.requestSync();
    });
    void subscriber.subscribe(TWITCH_COMMAND_CHANNEL).catch(() => undefined);
    subscriber.on('message', (channel, raw) => {
      if (channel === TWITCH_COMMAND_CHANNEL) void this.onDashboardCommand(raw);
    });
    this.requestSync();
    this.syncTimer = setInterval(() => this.requestSync(), SYNC_INTERVAL_MS);
    this.tickTimer = setInterval(() => void this.runTimers(), TIMER_TICK_MS);
  }

  stop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.socket.stop();
    for (const socket of this.ownerSockets.values()) socket.stop();
  }

  requestSync(): void {
    if (this.syncing) {
      this.resyncQueued = true;
      return;
    }
    this.syncing = this.sync()
      .catch((err: unknown) => this.ctx.logger.warn({ err }, 'Twitch chat sync failed'))
      .finally(() => {
        this.syncing = null;
        if (this.resyncQueued) {
          this.resyncQueued = false;
          this.requestSync();
        }
      });
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  private async sync(): Promise<void> {
    if (Date.now() - this.lastPrune > 6 * 3_600_000) {
      this.lastPrune = Date.now();
      void pruneModLog();
    }
    const wanted: { guildId: string; config: TwitchChatConfig }[] = [];
    for (const guildId of this.ctx.client.guilds.cache.keys()) {
      if (!(await this.ctx.config.isEnabled(guildId, 'TWITCH_CHAT'))) {
        await this.ctx.redis.del(twitchChatStatusKey(guildId));
        continue;
      }
      wanted.push({ guildId, config: await this.ctx.config.getConfig(guildId, 'TWITCH_CHAT') });
    }

    const account = wanted.length > 0 ? await this.helix.account() : null;
    this.bot = account ? { id: account.twitchUserId, login: account.login } : { id: '', login: '' };
    this.botScopes = account?.scopes ?? [];
    if (!account || wanted.every((w) => !w.config.channel)) {
      this.stopAll();
      for (const { guildId, config } of wanted) {
        await this.writeStatus(guildId, {
          channel: config.channel,
          connected: false,
          isModerator: null,
          live: false,
          broadcaster: 'missing',
          problem: !account
            ? 'Connect the bot’s Twitch account.'
            : 'Set the Twitch channel to join.',
        });
      }
      return;
    }

    const logins = [
      ...new Set(wanted.flatMap((w) => (w.config.channel ? [w.config.channel] : []))),
    ];
    const users = await this.helix.usersByLogin(logins);
    const idByLogin = new Map(users.map((u) => [u.login.toLowerCase(), u.id]));

    const next = new Map<string, ChannelState>();
    for (const { guildId, config } of wanted) {
      const login = config.channel;
      const broadcasterId = login ? idByLogin.get(login) : undefined;
      if (!login || !broadcasterId) {
        await this.writeStatus(guildId, {
          channel: login,
          connected: false,
          isModerator: null,
          live: false,
          broadcaster: 'missing',
          problem: login
            ? `Twitch has no channel called “${login}”.`
            : 'Set the Twitch channel to join.',
        });
        continue;
      }
      const previous = this.channels.get(broadcasterId);
      next.set(broadcasterId, {
        guildId,
        login,
        broadcasterId,
        config,
        blocked: compileBlockedTerms(config.blockedTerms),
        keywords: compileKeywords(config.keywords),
        live: previous?.live ?? false,
        timerLastSent: previous?.timerLastSent ?? new Map(),
        timerLines: previous?.timerLines ?? new Map(),
        timerIndex: previous?.timerIndex ?? new Map(),
        cooldowns: previous?.cooldowns ?? new Map(),
        permits: previous?.permits ?? new Map(),
        offences: previous?.offences ?? new Map(),
        history: previous?.history ?? new ChatHistory(),
        radiation: previous?.radiation ?? [],
        votekick: previous?.votekick ?? null,
        voteskip: previous?.voteskip ?? null,
        filesay: previous?.filesay ?? null,
        thanked: previous?.thanked ?? new Set(),
        stream: previous?.stream ?? null,
        channelInfo: previous?.channelInfo ?? null,
      });
    }
    this.channels = next;

    // Live state, so commands/timers know whether we're streaming.
    for (const state of this.channels.values()) {
      const stream = await this.stream(state);
      state.live = Boolean(stream);
      if (stream?.game_name)
        await trackGame(state.broadcasterId, stream.game_name, Date.parse(stream.started_at));
    }

    if (this.channels.size === 0) {
      this.stopAll();
      return;
    }
    if (!this.socket.running) {
      this.subscribed.clear();
      this.socket.start();
    } else if (this.socket.sessionId) {
      await this.subscribeBot(this.socket.sessionId);
    }
    await this.syncOwners();
    await this.reportStatuses();
  }

  private stopAll(): void {
    this.channels.clear();
    this.socket.stop();
    this.subscribed.clear();
    for (const socket of this.ownerSockets.values()) socket.stop();
    this.ownerSockets.clear();
    this.ownerSubscribed.clear();
  }

  private async onBotSession(sessionId: string, migrated: boolean): Promise<void> {
    if (migrated) return;
    this.subscribed.clear();
    await this.subscribeBot(sessionId);
    await this.reportStatuses();
  }

  private async subscribeWith(
    helix: TwitchHelix,
    sessionId: string,
    subscriptions: [string, string, Record<string, string>][],
  ): Promise<string | null> {
    let firstError: string | null = null;
    for (const [type, version, condition] of subscriptions) {
      let res = await helix.subscribe(type, version, condition, sessionId);
      // Newer event versions may not be available everywhere yet.
      if (res.status === 400 && version !== '1')
        res = await helix.subscribe(type, '1', condition, sessionId);
      if (res.status !== 202 && res.status !== 409) {
        this.ctx.logger.warn(
          { type, status: res.status, message: res.message },
          'Twitch subscription failed',
        );
        if (type === 'channel.chat.message') firstError = res.message ?? `HTTP ${res.status}`;
      }
    }
    return firstError;
  }

  private async subscribeBot(sessionId: string): Promise<void> {
    if (!this.bot.id) return;
    for (const state of this.channels.values()) {
      if (this.subscribed.has(state.broadcasterId)) continue;
      const error = await this.subscribeWith(
        this.helix,
        sessionId,
        botSubscriptions(state.broadcasterId, this.bot.id),
      );
      if (error) {
        this.subscribeErrors.set(state.broadcasterId, error);
      } else {
        this.subscribed.add(state.broadcasterId);
        this.subscribeErrors.delete(state.broadcasterId);
        this.ctx.logger.info({ channel: state.login }, 'Twitch chat joined');
      }
    }
  }

  /** One socket per broadcaster who connected their own account. */
  private async syncOwners(): Promise<void> {
    const wanted = new Set<string>();
    for (const state of this.channels.values()) {
      const helix =
        this.ownerHelix.get(state.broadcasterId) ??
        new TwitchHelix(this.ctx.prisma, broadcasterAccountId(state.broadcasterId));
      const account = await helix.account();
      if (!account) continue;
      this.ownerHelix.set(state.broadcasterId, helix);
      wanted.add(state.broadcasterId);
      if (this.ownerSockets.has(state.broadcasterId)) continue;
      const broadcasterId = state.broadcasterId;
      const socket = new EventSubSocket(
        {
          onSession: async (sessionId, migrated) => {
            if (migrated) return;
            this.ownerSubscribed.delete(broadcasterId);
            await this.subscribeWith(helix, sessionId, broadcasterSubscriptions(broadcasterId));
            this.ownerSubscribed.add(broadcasterId);
          },
          onNotification: (type, event) => this.onEvent(type, event as Record<string, unknown>),
        },
        this.ctx.logger,
      );
      this.ownerSockets.set(broadcasterId, socket);
      socket.start();
    }
    for (const [id, socket] of this.ownerSockets) {
      if (wanted.has(id)) continue;
      socket.stop();
      this.ownerSockets.delete(id);
      this.ownerHelix.delete(id);
      this.ownerSubscribed.delete(id);
    }
  }

  async broadcasterHelix(state: ChannelState): Promise<TwitchHelix | null> {
    const helix = this.ownerHelix.get(state.broadcasterId);
    if (helix && (await helix.account())) return helix;
    const fresh = new TwitchHelix(this.ctx.prisma, broadcasterAccountId(state.broadcasterId));
    return (await fresh.account()) ? fresh : null;
  }

  private async reportStatuses(): Promise<void> {
    const moderated = this.bot.id ? await this.helix.moderatedChannelIds(this.bot.id) : null;
    const botNeedsReconnect = TWITCH_BOT_SCOPES.some((scope) => !this.botScopes.includes(scope));
    for (const state of this.channels.values()) {
      const isModerator = moderated
        ? moderated.has(state.broadcasterId) || state.broadcasterId === this.bot.id
        : null;
      const connected = this.subscribed.has(state.broadcasterId);
      const owner = await prisma.twitchAccount.findUnique({
        where: { id: broadcasterAccountId(state.broadcasterId) },
        select: { scopes: true },
      });
      const broadcaster = !owner
        ? 'missing'
        : TWITCH_BROADCASTER_SCOPES.some((scope) => !owner.scopes.includes(scope))
          ? 'needs-reconnect'
          : 'connected';
      let problem: string | null = null;
      if (isModerator === false) {
        problem = `${this.bot.login} isn’t a moderator in ${state.login}’s chat yet. Have ${state.login} type /mod ${this.bot.login} in chat.`;
      } else if (!connected) {
        const error = this.subscribeErrors.get(state.broadcasterId);
        problem = error
          ? `Twitch refused to let the bot read chat: ${error}`
          : 'Connecting to Twitch chat…';
      }
      await this.writeStatus(state.guildId, {
        channel: state.login,
        connected,
        isModerator,
        live: state.live,
        broadcaster,
        problem,
        botNeedsReconnect,
      });
    }
  }

  private async writeStatus(
    guildId: string,
    status: Omit<TwitchChatStatus, 'checkedAt' | 'botLogin' | 'botNeedsReconnect'> & {
      botNeedsReconnect?: boolean;
    },
  ): Promise<void> {
    const value: TwitchChatStatus = {
      checkedAt: new Date().toISOString(),
      botLogin: this.bot.login || null,
      botNeedsReconnect: false,
      ...status,
    };
    await this.ctx.redis
      .set(twitchChatStatusKey(guildId), JSON.stringify(value), 'EX', 600)
      .catch(() => undefined);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private onEvent(type: string, event: Record<string, unknown>): void {
    const broadcasterId = String(event.broadcaster_user_id ?? event.to_broadcaster_user_id ?? '');
    const state = this.channels.get(broadcasterId);
    if (!state) return;
    const run = async () => {
      if (type === 'channel.chat.message') {
        const chat = event as unknown as ChatEvent;
        if (chat.chatter_user_id === this.bot.id) return;
        if (chat.cheer?.bits) {
          await handleBits(
            this,
            state,
            {
              id: chat.chatter_user_id,
              login: chat.chatter_user_login,
              name: chat.chatter_user_name,
            },
            chat.cheer.bits,
            chat.message.text,
          );
        }
        await handleChatMessage(this, state, chat);
      } else if (type === 'channel.chat.notification') {
        await handleNotification(this, state, event as never);
      } else {
        await handleChannelEvent(this, state, type, event);
      }
    };
    void run().catch((err: unknown) =>
      this.ctx.logger.warn({ err, type }, 'Twitch event handling failed'),
    );
  }

  // ── Sending & moderation ──────────────────────────────────────────────────

  async say(state: ChannelState, message: string, replyTo?: string): Promise<void> {
    if (!this.bot.id || !message.trim()) return;
    const now = Date.now();
    while (this.sent.length > 0 && now - (this.sent[0] ?? 0) > SEND_WINDOW_MS) this.sent.shift();
    if (this.sent.length >= SEND_LIMIT) {
      this.ctx.logger.warn({ channel: state.login }, 'Twitch chat send skipped (rate limit)');
      return;
    }
    this.sent.push(now);
    const result = await this.helix.sendMessage(state.broadcasterId, this.bot.id, message, replyTo);
    if (!result.ok)
      this.ctx.logger.warn(
        { channel: state.login, reason: result.reason },
        'Twitch chat send failed',
      );
  }

  async respond(
    state: ChannelState,
    chatter: Chatter | null,
    message: string,
    type: TwitchResponseType,
  ): Promise<void> {
    if (!message.trim()) return;
    if (!chatter || type === 'say') return this.say(state, message);
    if (type === 'reply' && chatter.messageId) return this.say(state, message, chatter.messageId);
    if (type === 'whisper' && chatter.id) {
      if (await this.helix.whisper(this.bot.id, chatter.id, message)) return;
      // Whispers need a phone-verified bot account; fall back to a reply.
      return this.say(state, message, chatter.messageId);
    }
    return this.say(state, `@${chatter.name}, ${message}`);
  }

  async punish(
    state: ChannelState,
    chatter: { id: string; login: string; messageId?: string },
    action: 'delete' | 'timeout' | 'ban',
    seconds: number,
    reason: string,
  ): Promise<boolean> {
    if (!this.bot.id || !chatter.id || chatter.id === state.broadcasterId) return false;
    if (action === 'delete') {
      return chatter.messageId
        ? this.helix.deleteMessage(state.broadcasterId, this.bot.id, chatter.messageId)
        : false;
    }
    return this.helix.ban(
      state.broadcasterId,
      this.bot.id,
      chatter.id,
      action === 'ban' ? null : seconds,
      reason,
    );
  }

  log(state: ChannelState, entry: ModLogEntry): Promise<string | null> {
    return writeModLog(state.guildId, entry);
  }

  dashboardUrl(path: string): string | null {
    const base = (process.env.DASHBOARD_URL ?? process.env.AUTH_URL ?? '').replace(/\/+$/, '');
    return base ? `${base}${path}` : null;
  }

  // ── Stream info (cached) ──────────────────────────────────────────────────

  async stream(state: ChannelState): Promise<HelixStream | null> {
    if (state.stream && Date.now() - state.stream.at < STREAM_CACHE_MS) return state.stream.value;
    const value = await this.helix.stream(state.broadcasterId);
    if (value === undefined) return state.stream?.value ?? null;
    state.stream = { at: Date.now(), value };
    return value;
  }

  async channel(state: ChannelState): Promise<HelixChannel | null> {
    if (state.channelInfo && Date.now() - state.channelInfo.at < STREAM_CACHE_MS)
      return state.channelInfo.value;
    const value = await this.helix.channel(state.broadcasterId);
    state.channelInfo = { at: Date.now(), value };
    return value;
  }

  // ── Variables ─────────────────────────────────────────────────────────────

  variables(
    state: ChannelState,
    chatter: Chatter | null,
    args: string[],
    extra: { commandId?: string; bits?: number; values?: Record<string, string | number> } = {},
  ): VariableContext {
    return {
      user: chatter?.name ?? '',
      args,
      channel: state.login,
      msgId: chatter?.messageId,
      bits: extra.bits,
      extra: extra.values,
      lookup: (name, arg, ctx) => this.lookup(state, chatter, name, arg, ctx, extra.commandId),
    };
  }

  private async userFor(state: ChannelState, chatter: Chatter | null, login: string) {
    const name = stripAt(login).toLowerCase();
    if (chatter && name === chatter.login)
      return { id: chatter.id, login: chatter.login, created_at: undefined as string | undefined };
    const [user] = await this.helix.usersByLogin([name]);
    return user ?? null;
  }

  private async lookup(
    state: ChannelState,
    chatter: Chatter | null,
    name: string,
    arg: string,
    ctx: VariableContext,
    commandId?: string,
  ): Promise<string | null> {
    const integrations = state.config.integrations;
    switch (name) {
      case 'uptime': {
        const stream = await this.stream(state);
        return stream ? formatUptime(Date.now() - Date.parse(stream.started_at)) : 'offline';
      }
      case 'downtime': {
        if (state.live) return 'live now';
        const at = Number(await redis.get(lastOfflineKey(state.broadcasterId)).catch(() => null));
        return at ? formatSpan(Date.now() - at) : 'a while';
      }
      case 'game':
        return (await this.channel(state))?.game_name || 'no category';
      case 'title':
        return (await this.channel(state))?.title || 'no title';
      case 'gamesplayed':
        return describeGamesPlayed(await readStreamRecord(state.broadcasterId)) || 'nothing yet';
      case 'viewers':
        return String((await this.stream(state))?.viewer_count ?? 0);
      case 'followers':
      case 'followcount':
        return String((await this.helix.followerCount(state.broadcasterId)) ?? 0);
      case 'subcount': {
        const owner = await this.broadcasterHelix(state);
        if (!owner) return 'unknown';
        return String((await owner.subscriberCount(state.broadcasterId)) ?? 0);
      }
      case 'botuptime':
        return formatSpan(Date.now() - this.startedAt);
      case 'chatters': {
        const chatters = await this.helix.chatters(state.broadcasterId, this.bot.id);
        return String(chatters?.total ?? 0);
      }
      case 'randomchatter':
      case 'randomuser': {
        const chatters = await this.helix.chatters(state.broadcasterId, this.bot.id);
        const list = chatters?.logins.filter((login) => login !== this.bot.login) ?? [];
        return list[Math.floor(Math.random() * list.length)] ?? state.login;
      }
      case 'followage':
      case 'followdate': {
        const who = arg || touser(ctx);
        const user = await this.userFor(state, chatter, who);
        if (!user) return `no user called ${who}`;
        const at = await this.helix.followedAt(state.broadcasterId, user.id);
        if (at === undefined) return 'unknown';
        if (at === null) return `${user.login} isn’t following`;
        return name === 'followage' ? formatFollowAge(at) : formatDate(at);
      }
      case 'accountage':
      case 'accountdate': {
        const who = arg || touser(ctx);
        const user = await this.userFor(state, chatter, who);
        const created =
          user?.created_at ??
          (user ? (await this.helix.usersById([user.id]))[0]?.created_at : undefined);
        if (!created) return `no user called ${who}`;
        return name === 'accountage'
          ? formatFollowAge(new Date(created))
          : formatDate(new Date(created));
      }
      case 'count': {
        if (arg) return String(await addCounter(state.guildId, arg, 1));
        return commandId ? String(await addCounter(state.guildId, `cmd:${commandId}`, 1)) : null;
      }
      case 'getcount':
        return arg ? String(await getCounter(state.guildId, arg)) : null;
      case 'quote': {
        const quote = await findQuote(state.guildId, arg);
        return quote ? formatQuote(quote) : 'no quotes yet';
      }
      case 'dadjoke':
        return dadJoke();
      case 'fact':
        return randomFact();
      case 'weather':
        return weather(arg);
      case 'customapi':
      case 'urlfetch':
        return customApi(arg);
      case 'twitchemotes':
        return (await this.helix.channelEmotes(state.broadcasterId)).join(' ') || 'no emotes';
      case '7tvemotes':
        return (await sevenTvEmotes(state.broadcasterId)).join(' ') || 'no 7TV emotes';
      case 'bttvemotes':
        return (await bttvEmotes(state.broadcasterId)).join(' ') || 'no BTTV emotes';
      case 'ffzemotes':
        return (await ffzEmotes(state.broadcasterId)).join(' ') || 'no FFZ emotes';
      case 'youtube':
        return latestYouTube(arg || integrations.youtubeChannelId);
      case 'tiktok':
        return latestTikTok(arg || integrations.tiktokUser);
      case 'mastodon':
        return latestMastodon(arg || integrations.mastodon);
      case 'lastfm':
        return lastFm(arg || integrations.lastfmUser);
      case 'leagueoflegends':
      case 'league':
        return leagueRank(arg || integrations.riotId, integrations.riotRegion);
      case 'teamfighttactics':
      case 'tft':
        return tftRank(arg || integrations.riotId, integrations.riotRegion);
      case 'valorant':
        return valorantRank(arg || integrations.riotId, integrations.valorantRegion);
      default:
        return null;
    }
  }

  // ── Timers ────────────────────────────────────────────────────────────────

  private async runTimers(): Promise<void> {
    const now = Date.now();
    for (const state of this.channels.values()) {
      if (!this.subscribed.has(state.broadcasterId)) continue;
      for (const timer of state.config.timers) {
        if (!timer.enabled) continue;
        const interval = state.live ? timer.liveInterval : timer.offlineInterval;
        if (interval <= 0) continue;
        const last = state.timerLastSent.get(timer.id) ?? this.startedAt;
        if (now - last < interval * 60_000) continue;
        if ((state.timerLines.get(timer.id) ?? 0) < timer.minLines) continue;
        const index = (state.timerIndex.get(timer.id) ?? 0) % timer.messages.length;
        state.timerIndex.set(timer.id, index + 1);
        state.timerLastSent.set(timer.id, now);
        state.timerLines.set(timer.id, 0);
        const template = timer.messages[index] ?? '';
        const message = await renderTwitchTemplate(template, this.variables(state, null, []));
        await this.say(state, message).catch(() => undefined);
      }
    }
  }

  // ── Dashboard commands ────────────────────────────────────────────────────

  private async onDashboardCommand(raw: string): Promise<void> {
    let command: {
      guildId: string;
      type: string;
      payload?: Record<string, unknown>;
      requestId?: string;
    };
    try {
      command = JSON.parse(raw) as typeof command;
    } catch {
      return;
    }
    const state = [...this.channels.values()].find((s) => s.guildId === command.guildId);
    if (!state || !command.requestId) return;
    let result: { ok: boolean; message: string };
    try {
      result = await this.runDashboardCommand(state, command.type, command.payload ?? {});
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'Something went wrong.' };
    }
    await redis
      .set(twitchCommandResultKey(command.requestId), JSON.stringify(result), 'EX', 60)
      .catch(() => undefined);
  }

  private async runDashboardCommand(
    state: ChannelState,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; message: string }> {
    const actor = `dashboard:${String(payload.actor ?? '')}`;
    if (type === 'nuke') {
      const args = [String(payload.phrase ?? '')];
      args.push(`${Number(payload.scrollback ?? 60)}s`);
      const action = String(payload.action ?? 'timeout');
      args.push(action === 'timeout' ? `${Number(payload.seconds ?? 600)}s` : action);
      if (Number(payload.radiation ?? 0) > 0) args.push(`-r=${Number(payload.radiation)}s`);
      const spec = parseNuke(args);
      if ('error' in spec) return { ok: false, message: spec.error };
      const { count } = await runNuke(this, state, spec, actor);
      return { ok: true, message: `Nuked ${count} chatter${count === 1 ? '' : 's'}.` };
    }
    if (type === 'rollback') {
      const log = await prisma.twitchModLog.findFirst({
        where: { id: String(payload.logId ?? ''), guildId: state.guildId, kind: 'nuke' },
      });
      if (!log) return { ok: false, message: 'That nuke wasn’t found.' };
      const data = (log.data ?? {}) as { users?: { id: string; login: string }[]; action?: string };
      state.radiation = state.radiation.filter((r) => r.logId !== log.id);
      if (data.action === 'delete')
        return {
          ok: true,
          message: 'Deleted messages can’t be restored, but the radiation is stopped.',
        };
      let undone = 0;
      for (const user of data.users ?? []) {
        if (await this.helix.unban(state.broadcasterId, this.bot.id, user.id)) undone++;
      }
      await writeModLog(state.guildId, {
        kind: 'rollback',
        action: 'unban',
        detail: `Undid nuke “${String((log.data as { phrase?: string })?.phrase ?? '')}” for ${undone} chatter${undone === 1 ? '' : 's'}`,
        actor,
      });
      return {
        ok: true,
        message: `Lifted ${undone} timeout${undone === 1 ? '' : 's'}/ban${undone === 1 ? '' : 's'}.`,
      };
    }
    if (type === 'say') {
      const message = String(payload.message ?? '').trim();
      if (!message) return { ok: false, message: 'Write a message.' };
      await this.say(state, message.slice(0, 500));
      return { ok: true, message: 'Sent.' };
    }
    if (type === 'shoutout') {
      const login = stripAt(String(payload.login ?? '')).toLowerCase();
      if (!login) return { ok: false, message: 'Give a username.' };
      await shoutout(this, state, login);
      return { ok: true, message: `Shouted out ${login}.` };
    }
    return { ok: false, message: 'Unknown command.' };
  }
}

export { TWITCH_BOT_ACCOUNT_ID };
