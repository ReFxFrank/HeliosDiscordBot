import WebSocket from 'ws';
import type { Logger } from '../../logger';

/**
 * A Twitch EventSub WebSocket session. Twitch sends a welcome with a session
 * id (subscriptions are then created over Helix for that id), keepalives,
 * notifications, and occasionally a reconnect URL to move to.
 *
 * - On `session_reconnect` we open the new URL and drop the old socket once
 *   the new one is welcomed; subscriptions carry over, so `onSession` is told
 *   it's a migration and must not resubscribe.
 * - If keepalives stop or the socket dies, we start a fresh session (with
 *   backoff) and `onSession` resubscribes.
 */

const DEFAULT_URL = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';

interface Envelope {
  metadata?: { message_type?: string; subscription_type?: string; message_id?: string };
  payload?: {
    session?: { id: string; keepalive_timeout_seconds?: number; reconnect_url?: string };
    subscription?: { type: string; status?: string; condition?: Record<string, string> };
    event?: unknown;
  };
}

export interface EventSubHandlers {
  /** A session is ready. `migrated` = subscriptions carried over from before. */
  onSession: (sessionId: string, migrated: boolean) => void | Promise<void>;
  onNotification: (type: string, event: unknown) => void;
  onRevoked?: (type: string, status: string, condition: Record<string, string>) => void;
}

export class EventSubSocket {
  private socket: WebSocket | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private keepaliveMs = 40_000;
  private attempts = 0;
  private stopped = true;
  private readonly seen = new Set<string>();
  sessionId: string | null = null;

  constructor(
    private readonly handlers: EventSubHandlers,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open(DEFAULT_URL, false);
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.sessionId = null;
    socket?.removeAllListeners();
    socket?.close();
  }

  get running(): boolean {
    return !this.stopped;
  }

  private clearTimers(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.keepaliveTimer = null;
    this.reconnectTimer = null;
  }

  private armKeepalive(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      this.logger.warn('Twitch EventSub keepalive missed; reconnecting');
      this.restart();
    }, this.keepaliveMs + 10_000);
  }

  /** Throw the session away and open a fresh one after a backoff. */
  private restart(): void {
    if (this.stopped) return;
    this.clearTimers();
    const old = this.socket;
    this.socket = null;
    this.sessionId = null;
    old?.removeAllListeners();
    old?.terminate();
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(this.attempts, 6));
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => this.open(DEFAULT_URL, false), delay);
  }

  private open(url: string, migrating: boolean): void {
    if (this.stopped) return;
    const socket = new WebSocket(url);
    if (!migrating) this.socket = socket;

    socket.on('message', (raw) => {
      let message: Envelope;
      try {
        message = JSON.parse(raw.toString()) as Envelope;
      } catch {
        return;
      }
      // Only the active socket's traffic counts (a migration socket becomes
      // active on its welcome).
      if (socket !== this.socket && message.metadata?.message_type !== 'session_welcome') return;
      this.armKeepalive();
      this.handle(socket, message, migrating);
    });
    socket.on('close', (code) => {
      if (socket !== this.socket || this.stopped) return;
      this.logger.warn({ code }, 'Twitch EventSub socket closed; reconnecting');
      this.restart();
    });
    socket.on('error', (err) => {
      this.logger.warn({ err: err.message }, 'Twitch EventSub socket error');
    });
  }

  private handle(socket: WebSocket, message: Envelope, migrating: boolean): void {
    const type = message.metadata?.message_type;
    const id = message.metadata?.message_id;
    if (id) {
      // Twitch may redeliver; act on each message once.
      if (this.seen.has(id)) return;
      this.seen.add(id);
      if (this.seen.size > 2000) this.seen.clear();
    }

    if (type === 'session_welcome') {
      const session = message.payload?.session;
      if (!session) return;
      this.keepaliveMs = (session.keepalive_timeout_seconds ?? 30) * 1000;
      if (migrating) {
        const old = this.socket;
        this.socket = socket;
        old?.removeAllListeners();
        old?.close();
      }
      this.sessionId = session.id;
      this.attempts = 0;
      this.armKeepalive();
      void Promise.resolve(this.handlers.onSession(session.id, migrating)).catch((err: unknown) =>
        this.logger.warn({ err }, 'Twitch EventSub session setup failed'),
      );
      return;
    }
    if (type === 'session_reconnect') {
      const url = message.payload?.session?.reconnect_url;
      if (url) this.open(url, true);
      return;
    }
    if (type === 'notification') {
      const subType = message.payload?.subscription?.type ?? message.metadata?.subscription_type;
      if (subType) this.handlers.onNotification(subType, message.payload?.event);
      return;
    }
    if (type === 'revocation') {
      const sub = message.payload?.subscription;
      if (sub) this.handlers.onRevoked?.(sub.type, sub.status ?? 'revoked', sub.condition ?? {});
    }
    // session_keepalive: the timer re-arm above is all it needs.
  }
}
