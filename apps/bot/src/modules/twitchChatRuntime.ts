import type { TwitchChatConfig, TwitchPermission, TwitchResponseType } from '@refx/shared';
import type { BotContext } from '../framework/context';
import type { BlockedTermMatcher } from '../lib/twitchChat/filters';
import type { CompiledKeyword } from '../lib/twitchChat/keywords';
import type { ChatHistory, NukeSpec } from '../lib/twitchChat/nuke';
import type { HelixChannel, HelixStream, TwitchHelix } from '../lib/twitchChat/helix';
import type { VariableContext } from '../lib/twitchChat/variables';
import type { ModLogEntry } from './twitchChatData';

/** Types shared by the Twitch chat service and its handlers. */

export interface ChatEvent {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message_id: string;
  message: { text: string; fragments?: { type: string; text: string }[] };
  badges?: { set_id: string }[];
  reply?: { parent_user_login?: string } | null;
  cheer?: { bits: number } | null;
}

export interface Radiation {
  spec: NukeSpec;
  until: number;
  logId: string | null;
  hit: Set<string>;
}

export interface ChannelState {
  guildId: string;
  login: string;
  broadcasterId: string;
  config: TwitchChatConfig;
  blocked: BlockedTermMatcher;
  keywords: CompiledKeyword[];
  live: boolean;
  timerLastSent: Map<string, number>;
  timerLines: Map<string, number>;
  timerIndex: Map<string, number>;
  cooldowns: Map<string, number>;
  /** login → permit expiry. */
  permits: Map<string, number>;
  /** userId → last filter offence (for escalation). */
  offences: Map<string, number>;
  history: ChatHistory;
  radiation: Radiation[];
  votekick: { targetId: string; target: string; voters: Set<string>; until: number } | null;
  voteskip: { songId: string; voters: Set<string> } | null;
  filesay: { cancelled: boolean } | null;
  /** Followers already thanked this session. */
  thanked: Set<string>;
  stream: { at: number; value: HelixStream | null } | null;
  channelInfo: { at: number; value: HelixChannel | null } | null;
}

export interface Chatter {
  id: string;
  login: string;
  name: string;
  level: TwitchPermission;
  messageId?: string;
}

export interface ChatRuntime {
  ctx: BotContext;
  /** The bot account's API client. */
  helix: TwitchHelix;
  /** The broadcaster's API client, when they connected their account. */
  broadcasterHelix(state: ChannelState): Promise<TwitchHelix | null>;
  bot: { id: string; login: string };
  startedAt: number;
  say(state: ChannelState, message: string, replyTo?: string): Promise<void>;
  respond(
    state: ChannelState,
    chatter: Chatter | null,
    message: string,
    type: TwitchResponseType,
  ): Promise<void>;
  variables(
    state: ChannelState,
    chatter: Chatter | null,
    args: string[],
    extra?: { commandId?: string; bits?: number; values?: Record<string, string | number> },
  ): VariableContext;
  stream(state: ChannelState): Promise<HelixStream | null>;
  channel(state: ChannelState): Promise<HelixChannel | null>;
  log(state: ChannelState, entry: ModLogEntry): Promise<string | null>;
  /** Act on a chatter: delete their message, time them out or ban them. */
  punish(
    state: ChannelState,
    chatter: { id: string; login: string; messageId?: string },
    action: 'delete' | 'timeout' | 'ban',
    seconds: number,
    reason: string,
  ): Promise<boolean>;
  dashboardUrl(path: string): string | null;
}
