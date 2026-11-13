import { z } from 'zod';

/**
 * Twitch Chat module: a Fossabot-style bot in the streamer's Twitch chat.
 * Custom and default `!commands` with `$(variables)`, keywords, timers, spam
 * filters, blocked terms, chat alerts, quotes, counters, song requests and
 * moderation tools. The bot posts as its own Twitch account (connected once on
 * the dashboard, a moderator in the channel); a few features also need the
 * broadcaster to connect their account.
 */

// ── Permissions ─────────────────────────────────────────────────────────────

/** Who may use something (Twitch chat badges, lowest to highest). */
export const TWITCH_PERMISSIONS = [
  'everyone',
  'subscriber',
  'vip',
  'moderator',
  'broadcaster',
] as const;
export type TwitchPermission = (typeof TWITCH_PERMISSIONS)[number];

export const TWITCH_PERMISSION_LABELS: Record<TwitchPermission, string> = {
  everyone: 'Everyone',
  subscriber: 'Subscribers',
  vip: 'VIPs',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster only',
};

/** Rank for comparisons: a VIP may use subscriber commands, and so on. */
export function twitchPermissionRank(level: TwitchPermission): number {
  return TWITCH_PERMISSIONS.indexOf(level);
}

/** Highest level a chatter holds, from their chat badges' set ids. */
export function twitchLevelFromBadges(badges: readonly string[]): TwitchPermission {
  const has = (id: string) => badges.includes(id);
  if (has('broadcaster')) return 'broadcaster';
  if (has('moderator') || has('lead_moderator')) return 'moderator';
  if (has('vip')) return 'vip';
  if (has('subscriber') || has('founder')) return 'subscriber';
  return 'everyone';
}

export function twitchCanUse(user: TwitchPermission, required: TwitchPermission): boolean {
  return twitchPermissionRank(user) >= twitchPermissionRank(required);
}

// ── Limits ──────────────────────────────────────────────────────────────────

/** Twitch's chat message limit. */
export const TWITCH_MESSAGE_MAX = 500;
export const TWITCH_COMMANDS_MAX = 300;
export const TWITCH_TIMERS_MAX = 30;
export const TWITCH_KEYWORDS_MAX = 100;
export const TWITCH_BLOCKED_TERMS_MAX = 500;
export const TWITCH_TIMER_MESSAGES_MAX = 10;

const id = z.string().regex(/^[a-z0-9-]{1,40}$/);

// ── Variables (documentation for the dashboard; the bot implements them) ──

export interface TwitchVariableDoc {
  token: string;
  desc: string;
  group: 'Chat' | 'Stream' | 'Users' | 'Counters' | 'Utility' | 'Fun' | 'Socials' | 'Games';
}

export const TWITCH_VARIABLES: TwitchVariableDoc[] = [
  { token: '$(user)', desc: 'Who used the command', group: 'Chat' },
  { token: '$(touser)', desc: 'The first word after the command, or the user', group: 'Chat' },
  { token: '$(query)', desc: 'Everything after the command', group: 'Chat' },
  { token: '$(1)', desc: 'A word after the command: $(1), $(2)…', group: 'Chat' },
  { token: '$(2:)', desc: 'Words from the 2nd on ($(1:3) = 1st to 3rd)', group: 'Chat' },
  { token: '$(channel)', desc: 'The channel name', group: 'Chat' },
  { token: '$(chatters)', desc: 'How many people are in chat', group: 'Chat' },
  { token: '$(msgid)', desc: 'The id of the message that triggered it', group: 'Chat' },
  { token: '$(bits)', desc: 'Bits cheered in the message', group: 'Chat' },
  { token: '$(echo text)', desc: 'Just the text (handy inside other variables)', group: 'Chat' },
  { token: '$(uptime)', desc: 'How long the stream has been live', group: 'Stream' },
  { token: '$(downtime)', desc: 'How long since the last stream ended', group: 'Stream' },
  { token: '$(game)', desc: 'The current category', group: 'Stream' },
  { token: '$(gamesplayed)', desc: 'Categories played this stream', group: 'Stream' },
  { token: '$(title)', desc: 'The stream title', group: 'Stream' },
  { token: '$(viewers)', desc: 'Current viewer count', group: 'Stream' },
  { token: '$(followers)', desc: 'Follower count', group: 'Stream' },
  { token: '$(subcount)', desc: 'Subscriber count (broadcaster connected)', group: 'Stream' },
  { token: '$(botuptime)', desc: 'How long the bot has been running', group: 'Stream' },
  { token: '$(followage)', desc: 'How long the user (or $(touser)) has followed', group: 'Users' },
  { token: '$(followdate)', desc: 'When the user (or $(touser)) followed', group: 'Users' },
  {
    token: '$(accountage)',
    desc: 'How old the user’s (or $(touser)’s) account is',
    group: 'Users',
  },
  { token: '$(accountdate)', desc: 'When the account was made', group: 'Users' },
  { token: '$(randomchatter)', desc: 'A random person in chat', group: 'Users' },
  {
    token: '$(count)',
    desc: 'Times this command was used (counts up each use)',
    group: 'Counters',
  },
  { token: '$(count name)', desc: 'Add 1 to a named counter and show it', group: 'Counters' },
  {
    token: '$(getcount name)',
    desc: 'Show a named counter without changing it',
    group: 'Counters',
  },
  { token: '$(countdown 2026-12-25)', desc: 'Time left until a date', group: 'Counters' },
  { token: '$(countup 2024-01-01)', desc: 'Time since a date', group: 'Counters' },
  { token: '$(quote)', desc: 'A random quote ($(quote 5) = quote #5)', group: 'Counters' },
  { token: '$(random 1-100)', desc: 'A random number in a range', group: 'Utility' },
  { token: '$(pick a,b,c)', desc: 'One of the options, at random', group: 'Utility' },
  { token: '$(math 2*(3+4))', desc: 'Work out a sum', group: 'Utility' },
  { token: '$(time America/New_York)', desc: 'The time in a timezone', group: 'Utility' },
  { token: '$(weather London)', desc: 'Current weather for a place', group: 'Utility' },
  { token: '$(repeat 3 hi)', desc: 'Repeat text a number of times', group: 'Utility' },
  { token: '$(customapi https://…)', desc: 'The text a web address returns', group: 'Utility' },
  { token: '$(urlencode text)', desc: 'Text made safe for a link', group: 'Utility' },
  { token: '$(8ball)', desc: 'A magic 8-ball answer', group: 'Fun' },
  { token: '$(dadjoke)', desc: 'A random dad joke', group: 'Fun' },
  { token: '$(fact)', desc: 'A random fact', group: 'Fun' },
  { token: '$(twitchemotes)', desc: 'The channel’s Twitch emotes', group: 'Fun' },
  { token: '$(7tvemotes)', desc: 'The channel’s 7TV emotes', group: 'Fun' },
  { token: '$(bttvemotes)', desc: 'The channel’s BTTV emotes', group: 'Fun' },
  { token: '$(ffzemotes)', desc: 'The channel’s FFZ emotes', group: 'Fun' },
  {
    token: '$(youtube)',
    desc: 'Latest video from the YouTube channel set in Integrations',
    group: 'Socials',
  },
  {
    token: '$(tiktok)',
    desc: 'Latest TikTok from the account set in Integrations',
    group: 'Socials',
  },
  {
    token: '$(mastodon)',
    desc: 'Latest post from the Mastodon account set in Integrations',
    group: 'Socials',
  },
  { token: '$(lastfm)', desc: 'What’s playing on Last.fm', group: 'Games' },
  { token: '$(leagueoflegends)', desc: 'League of Legends rank', group: 'Games' },
  { token: '$(teamfighttactics)', desc: 'Teamfight Tactics rank', group: 'Games' },
  { token: '$(valorant)', desc: 'Valorant rank', group: 'Games' },
];

// ── Commands ────────────────────────────────────────────────────────────────

export const TWITCH_RESPONSE_TYPES = ['say', 'mention', 'reply', 'whisper'] as const;
export type TwitchResponseType = (typeof TWITCH_RESPONSE_TYPES)[number];
export const TWITCH_RESPONSE_TYPE_LABELS: Record<TwitchResponseType, string> = {
  say: 'Say (normal message)',
  mention: 'Mention (@user, message)',
  reply: 'Reply (Twitch reply)',
  whisper: 'Whisper (private message)',
};

export const twitchCommandName = z
  .string()
  .trim()
  .toLowerCase()
  .transform((name) => name.replace(/^!+/, ''))
  .pipe(
    z.string().regex(/^[a-z0-9_]{1,30}$/, 'Command names use letters, numbers and _ (up to 30).'),
  );

export const twitchCommandSchema = z.preprocess(
  (raw) => {
    // v1 stored `reply: true` instead of a response type.
    if (raw && typeof raw === 'object' && !('responseType' in raw) && 'reply' in raw) {
      const { reply, ...rest } = raw as Record<string, unknown>;
      return { ...rest, responseType: reply ? 'reply' : 'say' };
    }
    return raw;
  },
  z.object({
    id,
    name: twitchCommandName,
    aliases: z.array(twitchCommandName).max(10).default([]),
    response: z.string().trim().min(1, 'Write a response.').max(TWITCH_MESSAGE_MAX),
    permission: z.enum(TWITCH_PERMISSIONS).default('everyone'),
    responseType: z.enum(TWITCH_RESPONSE_TYPES).default('say'),
    /** Seconds before anyone can use it again. */
    cooldown: z.number().int().min(0).max(86_400).default(5),
    /** Seconds before the same person can use it again. */
    userCooldown: z.number().int().min(0).max(86_400).default(15),
    whenLive: z.boolean().default(true),
    whenOffline: z.boolean().default(true),
    /** Left out of !commands but still works. */
    hidden: z.boolean().default(false),
    /** Whisper the response to someone who hits the cooldown. */
    whisperOnCooldown: z.boolean().default(false),
    /** Disable or delete the command at this time (ISO); null = never. */
    expiresAt: z.string().datetime().nullable().default(null),
    expireAction: z.enum(['disable', 'delete']).default('disable'),
    enabled: z.boolean().default(true),
    /** Who made it from chat (!addcmd), for the logs. */
    createdBy: z.string().max(50).nullable().default(null),
  }),
);
export type TwitchCommand = z.infer<typeof twitchCommandSchema>;

// ── Default commands ────────────────────────────────────────────────────────

export interface TwitchDefaultDoc {
  key: string;
  name: string;
  aliases?: string[];
  usage?: string;
  permission: TwitchPermission;
  group: 'Information' | 'Users' | 'Fun' | 'Songs' | 'Management';
  desc: string;
  /** Off until switched on (things that act on chatters or cost API calls). */
  offByDefault?: boolean;
  /** Needs the broadcaster's own Twitch connected. */
  broadcaster?: boolean;
}

export const TWITCH_DEFAULTS = [
  {
    key: 'commands',
    name: 'commands',
    permission: 'everyone',
    group: 'Information',
    desc: 'Lists the commands chat can use.',
  },
  {
    key: 'game',
    name: 'game',
    permission: 'everyone',
    group: 'Information',
    desc: 'The current category.',
  },
  {
    key: 'gamesplayed',
    name: 'gamesplayed',
    permission: 'everyone',
    group: 'Information',
    desc: 'Categories played this stream, with times.',
  },
  {
    key: 'title',
    name: 'title',
    permission: 'everyone',
    group: 'Information',
    desc: 'The stream title.',
  },
  {
    key: 'uptime',
    name: 'uptime',
    permission: 'everyone',
    group: 'Information',
    desc: 'How long the stream has been live.',
  },
  {
    key: 'downtime',
    name: 'downtime',
    permission: 'everyone',
    group: 'Information',
    desc: 'How long since the last stream.',
  },
  {
    key: 'ping',
    name: 'ping',
    permission: 'everyone',
    group: 'Information',
    desc: 'How long the bot has been running.',
  },
  {
    key: 'followage',
    name: 'followage',
    usage: '[user]',
    permission: 'everyone',
    group: 'Users',
    desc: 'How long someone has followed.',
  },
  {
    key: 'followdate',
    name: 'followdate',
    usage: '[user]',
    permission: 'everyone',
    group: 'Users',
    desc: 'When someone followed.',
  },
  {
    key: 'accountage',
    name: 'accountage',
    usage: '[user]',
    permission: 'everyone',
    group: 'Users',
    desc: 'How old someone’s account is.',
  },
  {
    key: 'accountdate',
    name: 'accountdate',
    usage: '[user]',
    permission: 'everyone',
    group: 'Users',
    desc: 'When someone’s account was made.',
  },
  {
    key: 'eightball',
    name: '8ball',
    aliases: ['eightball'],
    usage: '<question>',
    permission: 'everyone',
    group: 'Fun',
    desc: 'Ask the magic 8-ball.',
  },
  {
    key: 'dadjoke',
    name: 'dadjoke',
    permission: 'everyone',
    group: 'Fun',
    desc: 'A random dad joke.',
  },
  { key: 'fact', name: 'fact', permission: 'everyone', group: 'Fun', desc: 'A random fact.' },
  {
    key: 'dictionary',
    name: 'dictionary',
    aliases: ['define'],
    usage: '<word>',
    permission: 'everyone',
    group: 'Fun',
    desc: 'Dictionary definition.',
  },
  {
    key: 'urban',
    name: 'urban',
    aliases: ['urbandictionary'],
    usage: '<word>',
    permission: 'everyone',
    group: 'Fun',
    desc: 'Urban Dictionary definition.',
    offByDefault: true,
  },
  {
    key: 'emotes',
    name: 'emotes',
    permission: 'everyone',
    group: 'Fun',
    desc: 'The channel’s Twitch, 7TV, BTTV and FFZ emotes.',
  },
  {
    key: 'clip',
    name: 'clip',
    permission: 'everyone',
    group: 'Fun',
    desc: 'Clips the last 30 seconds and posts the link.',
  },
  {
    key: 'vanish',
    name: 'vanish',
    permission: 'everyone',
    group: 'Fun',
    desc: 'Times out the sender for 1 second (clears their messages).',
  },
  {
    key: 'votekick',
    name: 'votekick',
    usage: '<user>',
    permission: 'everyone',
    group: 'Fun',
    desc: 'Chat votes to time someone out.',
    offByDefault: true,
  },
  {
    key: 'quote',
    name: 'quote',
    usage: '[number|search] · add/edit/del (mods)',
    permission: 'everyone',
    group: 'Fun',
    desc: 'Show, add and manage quotes.',
  },
  {
    key: 'song',
    name: 'song',
    aliases: ['currentsong'],
    permission: 'everyone',
    group: 'Songs',
    desc: 'The song playing now.',
  },
  {
    key: 'sr',
    name: 'sr',
    aliases: ['songrequest'],
    usage: '<link or search>',
    permission: 'everyone',
    group: 'Songs',
    desc: 'Request a song.',
  },
  {
    key: 'queue',
    name: 'queue',
    aliases: ['songqueue', 'songs'],
    permission: 'everyone',
    group: 'Songs',
    desc: 'Link to the song queue.',
  },
  {
    key: 'wrongsong',
    name: 'wrongsong',
    permission: 'everyone',
    group: 'Songs',
    desc: 'Removes your latest request.',
  },
  {
    key: 'voteskip',
    name: 'voteskip',
    permission: 'everyone',
    group: 'Songs',
    desc: 'Vote to skip the current song.',
  },
  {
    key: 'skip',
    name: 'skip',
    permission: 'moderator',
    group: 'Songs',
    desc: 'Skip the current song.',
  },
  {
    key: 'volume',
    name: 'volume',
    usage: '[0-100]',
    permission: 'moderator',
    group: 'Songs',
    desc: 'Show or set the player volume.',
  },
  {
    key: 'clearqueue',
    name: 'clearqueue',
    aliases: ['clearsongs'],
    permission: 'moderator',
    group: 'Songs',
    desc: 'Empty the song queue.',
  },
  {
    key: 'cmd',
    name: 'cmd',
    usage: 'add|edit|del|show|alias|cooldown|level <name> …',
    permission: 'moderator',
    group: 'Management',
    desc: 'Manage custom commands from chat.',
  },
  {
    key: 'addcmd',
    name: 'addcmd',
    usage: '<name> <response>',
    permission: 'moderator',
    group: 'Management',
    desc: 'Create a custom command.',
  },
  {
    key: 'editcmd',
    name: 'editcmd',
    usage: '<name> <response>',
    permission: 'moderator',
    group: 'Management',
    desc: 'Change a custom command’s response.',
  },
  {
    key: 'delcmd',
    name: 'delcmd',
    usage: '<name>',
    permission: 'moderator',
    group: 'Management',
    desc: 'Delete a custom command.',
  },
  {
    key: 'setcommand',
    name: 'setcommand',
    usage: '<name> <response>',
    permission: 'moderator',
    group: 'Management',
    desc: 'Create or update a custom command.',
  },
  {
    key: 'count',
    name: 'count',
    usage: '<name> [+n|-n|=n|reset]',
    permission: 'moderator',
    group: 'Management',
    desc: 'Show or change a named counter.',
  },
  {
    key: 'permit',
    name: 'permit',
    usage: '<user> [seconds]',
    permission: 'moderator',
    group: 'Management',
    desc: 'Let someone skip the spam filters for a while.',
  },
  {
    key: 'nuke',
    name: 'nuke',
    usage: '<phrase|/regex/> [scrollback] [timeout|delete|ban] [-r=length]',
    permission: 'moderator',
    group: 'Management',
    desc: 'Punish everyone who said something recently.',
  },
  {
    key: 'so',
    name: 'so',
    aliases: ['shoutout'],
    usage: '<user>',
    permission: 'moderator',
    group: 'Management',
    desc: 'Shoutout with a chat message and Twitch’s card.',
  },
  {
    key: 'filesay',
    name: 'filesay',
    usage: '<link to a .txt>',
    permission: 'broadcaster',
    group: 'Management',
    desc: 'Send every line of a text file to chat.',
  },
  {
    key: 'filesaystop',
    name: 'filesaystop',
    permission: 'moderator',
    group: 'Management',
    desc: 'Stop a running !filesay.',
  },
  {
    key: 'settitle',
    name: 'settitle',
    usage: '<title>',
    permission: 'moderator',
    group: 'Management',
    desc: 'Change the stream title.',
    broadcaster: true,
  },
  {
    key: 'setgame',
    name: 'setgame',
    usage: '<category>',
    permission: 'moderator',
    group: 'Management',
    desc: 'Change the stream category.',
    broadcaster: true,
  },
] as const satisfies readonly TwitchDefaultDoc[];
export type TwitchDefaultKey = (typeof TWITCH_DEFAULTS)[number]['key'];

const defaultSetting = z.object({
  enabled: z.boolean(),
  permission: z.enum(TWITCH_PERMISSIONS),
  cooldown: z.number().int().min(0).max(3600).default(5),
});
export type TwitchDefaultSetting = z.infer<typeof defaultSetting>;

const defaultsSchema = z
  .record(z.string(), defaultSetting.partial())
  .default({})
  .transform((stored) => {
    const out = {} as Record<TwitchDefaultKey, TwitchDefaultSetting>;
    for (const doc of TWITCH_DEFAULTS) {
      const saved = stored[doc.key] ?? {};
      out[doc.key] = {
        enabled: saved.enabled ?? !('offByDefault' in doc && doc.offByDefault),
        permission: saved.permission ?? doc.permission,
        cooldown: saved.cooldown ?? 5,
      };
    }
    return out;
  });

// ── Timers ──────────────────────────────────────────────────────────────────

export const twitchTimerSchema = z.preprocess(
  (raw) => {
    // v1: one `message`, `interval`, `onlineOnly`.
    if (raw && typeof raw === 'object' && 'message' in raw && !('messages' in raw)) {
      const v1 = raw as Record<string, unknown>;
      const interval = typeof v1.interval === 'number' ? v1.interval : 15;
      return {
        ...v1,
        messages: [v1.message],
        liveInterval: interval,
        offlineInterval: v1.onlineOnly === false ? interval : 0,
      };
    }
    return raw;
  },
  z.object({
    id,
    name: z.string().trim().min(1).max(40),
    /** Posted in turn, one per run. */
    messages: z
      .array(z.string().trim().min(1, 'A timer message is empty.').max(TWITCH_MESSAGE_MAX))
      .min(1, 'Add a message.')
      .max(TWITCH_TIMER_MESSAGES_MAX),
    /** Minutes between posts while live (0 = not while live). */
    liveInterval: z.number().int().min(0).max(1440).default(15),
    /** Minutes between posts while offline (0 = not while offline). */
    offlineInterval: z.number().int().min(0).max(1440).default(0),
    /** Chat lines needed since the last post. */
    minLines: z.number().int().min(0).max(500).default(5),
    enabled: z.boolean().default(true),
  }),
);
export type TwitchTimer = z.infer<typeof twitchTimerSchema>;

// ── Keywords ────────────────────────────────────────────────────────────────

/**
 * A phrase may start with flags: `regex:`, `sensitive:` and `negative:`,
 * chained in any order (`negative:regex:^hi`). A group matches when every
 * phrase in it matches; any matching group triggers the keyword.
 */
export const TWITCH_KEYWORD_FLAGS = ['regex', 'sensitive', 'negative'] as const;

export const twitchKeywordSchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  groups: z
    .array(z.array(z.string().trim().min(1).max(200)).min(1).max(10))
    .min(1, 'Add a phrase.')
    .max(10),
  target: z.enum(['message', 'username', 'both']).default('message'),
  response: z.string().trim().min(1, 'Write a response.').max(TWITCH_MESSAGE_MAX),
  responseType: z.enum(TWITCH_RESPONSE_TYPES).default('say'),
  /** Who triggers it (chatters at or above this level). */
  permission: z.enum(TWITCH_PERMISSIONS).default('everyone'),
  cooldown: z.number().int().min(0).max(86_400).default(30),
  userCooldown: z.number().int().min(0).max(86_400).default(60),
  whenLive: z.boolean().default(true),
  whenOffline: z.boolean().default(true),
  enabled: z.boolean().default(true),
});
export type TwitchKeyword = z.infer<typeof twitchKeywordSchema>;

// ── Spam filters ────────────────────────────────────────────────────────────

export const TWITCH_FILTER_ACTIONS = ['delete', 'timeout', 'ban'] as const;
export type TwitchFilterAction = (typeof TWITCH_FILTER_ACTIONS)[number];

const filterBase = {
  enabled: z.boolean().default(false),
  action: z.enum(TWITCH_FILTER_ACTIONS).default('timeout'),
  /** Timeout length when the action is "timeout". */
  timeoutSeconds: z.number().int().min(1).max(1_209_600).default(600),
  /** Said in chat after acting; blank says nothing. $(user) works. */
  message: z.string().trim().max(200).default(''),
};

function filter<T extends z.ZodRawShape>(message: string, extra: T) {
  // preprocess (not .default) so the generic shape still type-checks.
  return z.preprocess(
    (value) => value ?? {},
    z.object({ ...filterBase, message: filterBase.message.default(message), ...extra }),
  );
}

export const TWITCH_FILTERS = [
  {
    key: 'links',
    title: 'Links',
    desc: 'Any link, unless the site is allowed or a mod used !permit.',
  },
  { key: 'caps', title: 'Caps', desc: 'Long messages that are mostly CAPITAL LETTERS.' },
  {
    key: 'symbols',
    title: 'Symbols',
    desc: 'Messages with too many symbols (emotes don’t count).',
  },
  { key: 'length', title: 'Message length', desc: 'Messages over a set number of characters.' },
  {
    key: 'height',
    title: 'Message height',
    desc: 'Messages that would fill too many lines of chat.',
  },
  {
    key: 'wordRepeat',
    title: 'Repetition',
    desc: 'The same word or emote repeated over and over in one message.',
  },
  {
    key: 'repeat',
    title: 'Repeated messages',
    desc: 'The same message sent again and again within a minute.',
  },
  { key: 'emotes', title: 'Emote spam', desc: 'Too many emotes in one message.' },
  { key: 'zalgo', title: 'Zalgo text', desc: 'G̷l̸i̵t̶c̷h̴y text stacked with combining marks.' },
  { key: 'mentions', title: 'Mass mentions', desc: 'Too many @mentions in one message.' },
  { key: 'longWord', title: 'Long words', desc: 'A single “word” that is absurdly long.' },
  { key: 'unicode', title: 'Fancy text', desc: 'Mostly 𝓯𝓪𝓷𝓬𝔂 or non-standard characters.' },
] as const;
export type TwitchFilterKey = (typeof TWITCH_FILTERS)[number]['key'];

export const twitchFiltersSchema = z.preprocess(
  (raw) => {
    // v1 kept banned words here; they moved to blockedTerms.
    if (raw && typeof raw === 'object' && 'words' in raw) {
      const { words: _words, ...rest } = raw as Record<string, unknown>;
      return rest;
    }
    return raw;
  },
  z
    .object({
      /** Chatters at or above this level are never filtered. Mods always are. */
      exempt: z.enum(['subscriber', 'vip', 'moderator']).default('vip'),
      /**
       * Fossabot-style escalation: a first offence only deletes the message
       * (or a short timeout) with a [warning]; offences within the window get
       * the filter's real action.
       */
      escalation: z
        .object({
          enabled: z.boolean().default(true),
          windowMinutes: z.number().int().min(1).max(1440).default(60),
          /** 0 = just delete. */
          warningTimeout: z.number().int().min(0).max(600).default(30),
        })
        .default({}),
      links: filter('$(user), please ask a mod before posting links.', {
        allowed: z.array(z.string().trim().toLowerCase().max(100)).max(100).default([]),
        /** Subscribers may post links. */
        allowSubscribers: z.boolean().default(false),
      }),
      caps: filter('$(user), easy on the caps please.', {
        minLength: z.number().int().min(5).max(500).default(15),
        maxPercent: z.number().int().min(10).max(100).default(80),
      }),
      symbols: filter('$(user), please don’t spam symbols.', {
        minLength: z.number().int().min(5).max(500).default(15),
        maxPercent: z.number().int().min(10).max(100).default(50),
        maxCount: z.number().int().min(1).max(500).default(15),
      }),
      length: filter('$(user), that message is too long.', {
        maxLength: z.number().int().min(20).max(500).default(400),
      }),
      height: filter('$(user), that message is too tall.', {
        /** Estimated lines in a ~340px chat column. */
        maxLines: z.number().int().min(2).max(30).default(8),
      }),
      wordRepeat: filter('$(user), that message is too repetitive.', {
        maxRepeats: z.number().int().min(2).max(100).default(8),
      }),
      repeat: filter('$(user), please don’t repeat yourself.', {
        /** Same message this many times in 60 seconds. */
        count: z.number().int().min(2).max(10).default(3),
      }),
      emotes: filter('$(user), too many emotes.', {
        maxEmotes: z.number().int().min(1).max(200).default(15),
      }),
      zalgo: filter('$(user), please don’t use glitchy text.', {}),
      mentions: filter('$(user), too many mentions.', {
        maxMentions: z.number().int().min(1).max(50).default(5),
      }),
      longWord: filter('$(user), that word is too long.', {
        maxLength: z.number().int().min(10).max(500).default(50),
      }),
      unicode: filter('$(user), please use normal text.', {
        minLength: z.number().int().min(3).max(500).default(10),
        maxPercent: z.number().int().min(10).max(100).default(50),
      }),
    })
    .default({}),
);
export type TwitchFilters = z.infer<typeof twitchFiltersSchema>;

// ── Blocked terms ───────────────────────────────────────────────────────────

/** Characters swapped for letters before matching blocked terms. */
export const TWITCH_DEFAULT_LOOKALIKES: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'l',
  '€': 'e',
};

export const twitchBlockedTermSchema = z.object({
  id,
  /** Plain text (matched anywhere, * = any letters) or a /regex/. */
  phrase: z.string().trim().min(1, 'A blocked term is empty.').max(200),
  regex: z.boolean().default(false),
  action: z.enum(TWITCH_FILTER_ACTIONS).default('timeout'),
  timeoutSeconds: z.number().int().min(1).max(1_209_600).default(600),
  /** Shown in the moderation reason and logs. */
  reason: z.string().trim().max(200).default(''),
  enabled: z.boolean().default(true),
});
export type TwitchBlockedTerm = z.infer<typeof twitchBlockedTermSchema>;

const blockedTermsSchema = z
  .object({
    /** Match 3→e, 0→o, @→a… so "fr0g" still matches "frog". */
    lookalikes: z.boolean().default(true),
    /** Extra swaps, one per line like `ß=b`. */
    extraLookalikes: z.string().max(1000).default(''),
    /** Chat message after acting; blank says nothing. */
    message: z.string().trim().max(200).default(''),
    terms: z.array(twitchBlockedTermSchema).max(TWITCH_BLOCKED_TERMS_MAX).default([]),
  })
  .default({});

// ── Chat alerts ─────────────────────────────────────────────────────────────

export interface TwitchAlertDoc {
  key: string;
  title: string;
  message: string;
  vars: string;
  /** Needs the broadcaster's own Twitch connected. */
  broadcaster?: boolean;
  /** On out of the box. */
  on?: boolean;
}

export const TWITCH_ALERTS = [
  {
    key: 'follow',
    title: 'Follows',
    message: 'Thanks for the follow, $(user)! 🐸',
    vars: '$(user)',
  },
  {
    key: 'sub',
    title: 'New subs',
    message: '$(user) just subscribed! Welcome to the pond 💚',
    vars: '$(user) $(tier)',
    on: true,
  },
  {
    key: 'resub',
    title: 'Resubs',
    message: '$(user) resubscribed for $(months) months! $(message)',
    vars: '$(user) $(months) $(streak) $(tier) $(message)',
    on: true,
  },
  {
    key: 'giftsub',
    title: 'Gifted subs',
    message: '$(user) gifted a sub to $(recipient)! 🎁',
    vars: '$(user) $(recipient) $(tier) $(total)',
    on: true,
  },
  {
    key: 'giftbomb',
    title: 'Gift bombs',
    message: '$(user) is gifting $(amount) subs to the community! 🎁',
    vars: '$(user) $(amount) $(tier) $(total)',
    on: true,
  },
  {
    key: 'bits',
    title: 'Bits',
    message: 'Thank you for the $(bits) bits, $(user)!',
    vars: '$(user) $(bits) $(message)',
    on: true,
  },
  {
    key: 'raid',
    title: 'Raids',
    message: '$(user) is raiding with $(viewers) viewers! Welcome raiders 🐸',
    vars: '$(user) $(viewers)',
    on: true,
  },
  { key: 'live', title: 'Going live', message: '', vars: '$(title) $(game)' },
  { key: 'offline', title: 'Stream ended', message: '', vars: '$(uptime)' },
  {
    key: 'titleChange',
    title: 'Title changes',
    message: 'Title changed to: $(title)',
    vars: '$(title)',
  },
  {
    key: 'gameChange',
    title: 'Category changes',
    message: 'Now playing: $(game)',
    vars: '$(game)',
  },
  {
    key: 'hypeTrainBegin',
    title: 'Hype train starts',
    message: 'A hype train has started! Choo choo 🚂',
    vars: '$(level)',
    broadcaster: true,
  },
  {
    key: 'hypeTrainEnd',
    title: 'Hype train ends',
    message: 'The hype train reached level $(level)! Thank you all!',
    vars: '$(level)',
    broadcaster: true,
  },
  {
    key: 'pollBegin',
    title: 'Polls start',
    message: 'Poll: $(title) — vote now!',
    vars: '$(title) $(choices)',
    broadcaster: true,
  },
  {
    key: 'pollEnd',
    title: 'Polls end',
    message: 'Poll “$(title)” ended. Winner: $(winner)',
    vars: '$(title) $(winner)',
    broadcaster: true,
  },
  {
    key: 'predictionBegin',
    title: 'Predictions start',
    message: 'Prediction: $(title) — place your points!',
    vars: '$(title) $(outcomes)',
    broadcaster: true,
  },
  {
    key: 'predictionLock',
    title: 'Predictions lock',
    message: 'Predictions are locked!',
    vars: '$(title)',
    broadcaster: true,
  },
  {
    key: 'predictionEnd',
    title: 'Predictions end',
    message: 'Prediction “$(title)” ended. Winner: $(winner)',
    vars: '$(title) $(winner)',
    broadcaster: true,
  },
  {
    key: 'charity',
    title: 'Charity donations',
    message: '$(user) donated $(amount) to $(charity)! 💚',
    vars: '$(user) $(amount) $(charity)',
    broadcaster: true,
  },
  {
    key: 'adBreak',
    title: 'Ad breaks',
    message: 'Ads are running for $(duration) seconds. Grab a drink! 🍵',
    vars: '$(duration)',
    broadcaster: true,
  },
  {
    key: 'reward',
    title: 'Channel point rewards',
    message: '',
    vars: '$(user) $(reward) $(input)',
    broadcaster: true,
  },
] as const satisfies readonly TwitchAlertDoc[];
export type TwitchAlertKey = (typeof TWITCH_ALERTS)[number]['key'];

const alertsSchema = z
  .record(
    z.string(),
    z.object({ enabled: z.boolean(), message: z.string().max(TWITCH_MESSAGE_MAX) }).partial(),
  )
  .default({})
  .transform((stored) => {
    const out = {} as Record<TwitchAlertKey, { enabled: boolean; message: string }>;
    for (const doc of TWITCH_ALERTS) {
      const saved = stored[doc.key] ?? {};
      out[doc.key] = {
        enabled: saved.enabled ?? ('on' in doc && doc.on === true),
        message: saved.message ?? doc.message,
      };
    }
    return out;
  });

const alertOptionsSchema = z
  .object({
    /** Bits below this don't get a thank-you. */
    minBits: z.number().int().min(1).max(1_000_000).default(1),
    /** Raids smaller than this don't get an alert. */
    minRaidViewers: z.number().int().min(0).max(1_000_000).default(0),
    /** Run !so for raiders automatically. */
    autoShoutoutRaids: z.boolean().default(true),
  })
  .default({});

// ── Quotes, songs, fun, integrations ────────────────────────────────────────

const quotesSchema = z
  .object({
    /** Who may add quotes (editing and deleting is always mods). */
    addPermission: z.enum(TWITCH_PERMISSIONS).default('moderator'),
  })
  .default({});

const songsSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Who may request. */
    permission: z.enum(TWITCH_PERMISSIONS).default('everyone'),
    maxDurationSeconds: z
      .number()
      .int()
      .min(30)
      .max(3 * 3600)
      .default(600),
    maxPerUser: z.number().int().min(1).max(50).default(3),
    maxQueue: z.number().int().min(1).max(500).default(50),
    /** Share of chatters (by recent activity) needed for !voteskip. */
    voteSkipVotes: z.number().int().min(1).max(100).default(3),
    volume: z.number().int().min(0).max(100).default(50),
    allowSearch: z.boolean().default(true),
    /** Only while live. */
    liveOnly: z.boolean().default(true),
  })
  .default({});

const funSchema = z
  .object({
    votekickVotes: z.number().int().min(2).max(100).default(5),
    votekickSeconds: z.number().int().min(1).max(600).default(60),
  })
  .default({});

const integrationsSchema = z
  .object({
    youtubeChannelId: z
      .string()
      .trim()
      .regex(/^(UC[\w-]{20,24})?$/, 'YouTube channel ids start with UC.')
      .default(''),
    tiktokUser: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => v.replace(/^@/, ''))
      .pipe(z.string().regex(/^([a-z0-9_.]{2,24})?$/, 'That isn’t a TikTok username.'))
      .default(''),
    /** user@instance.social */
    mastodon: z
      .string()
      .trim()
      .transform((v) => v.replace(/^@/, ''))
      .pipe(z.string().regex(/^([\w.]+@[\w.-]+\.\w+)?$/, 'Use name@instance.social.'))
      .default(''),
    lastfmUser: z.string().trim().max(50).default(''),
    /** Riot ID like Name#TAG, for League and TFT. */
    riotId: z
      .string()
      .trim()
      .regex(/^(.{3,16}#[A-Za-z0-9]{2,5})?$/, 'Use a Riot ID like Name#TAG.')
      .default(''),
    /** Riot platform for League/TFT ranks, e.g. na1, euw1. */
    riotRegion: z
      .enum([
        'na1',
        'euw1',
        'eun1',
        'kr',
        'jp1',
        'br1',
        'la1',
        'la2',
        'oc1',
        'tr1',
        'ru',
        'ph2',
        'sg2',
        'th2',
        'tw2',
        'vn2',
        'me1',
      ])
      .default('na1'),
    /** Valorant region for the HenrikDev API. */
    valorantRegion: z.enum(['na', 'eu', 'ap', 'kr', 'latam', 'br']).default('na'),
  })
  .default({});

// ── Whole config ────────────────────────────────────────────────────────────

export const twitchChatConfigSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const v1 = raw as Record<string, unknown>;
    const next: Record<string, unknown> = { ...v1 };
    // v1 `builtins` booleans → `defaults`.
    if (v1.builtins && !v1.defaults && typeof v1.builtins === 'object') {
      const builtins = v1.builtins as Record<string, unknown>;
      next.defaults = Object.fromEntries(
        Object.entries(builtins).map(([key, on]) => [
          key === 'shoutout' ? 'so' : key,
          { enabled: on === true },
        ]),
      );
    }
    delete next.builtins;
    // v1 banned words → blocked terms.
    const words = (v1.filters as { words?: { list?: unknown; enabled?: unknown } } | undefined)
      ?.words;
    if (words && Array.isArray(words.list) && words.list.length > 0 && !v1.blockedTerms) {
      next.blockedTerms = {
        terms: words.list.map((phrase, index) => ({
          id: `term-v1-${index}`,
          phrase,
          enabled: words.enabled === true,
        })),
      };
    }
    return next;
  },
  z
    .object({
      /** The Twitch channel (login name) the bot sits in. */
      channel: z
        .string()
        .trim()
        .toLowerCase()
        .transform((value) =>
          value
            .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//, '')
            .replace(/^@/, '')
            .replace(/[/?#].*$/, ''),
        )
        .pipe(z.string().regex(/^([a-z0-9_]{3,25})?$/, 'That isn’t a Twitch username.'))
        .transform((value) => value || null)
        .nullable()
        .default(null),
      commands: z.array(twitchCommandSchema).max(TWITCH_COMMANDS_MAX).default([]),
      defaults: defaultsSchema,
      timers: z.array(twitchTimerSchema).max(TWITCH_TIMERS_MAX).default([]),
      keywords: z.array(twitchKeywordSchema).max(TWITCH_KEYWORDS_MAX).default([]),
      filters: twitchFiltersSchema,
      blockedTerms: blockedTermsSchema,
      alerts: alertsSchema,
      alertOptions: alertOptionsSchema,
      quotes: quotesSchema,
      songs: songsSchema,
      fun: funSchema,
      integrations: integrationsSchema,
    })
    .superRefine((config, ctx) => {
      const taken = new Map<string, string>();
      for (const doc of TWITCH_DEFAULTS) {
        if (!config.defaults[doc.key].enabled) continue;
        for (const name of [doc.name, ...('aliases' in doc ? doc.aliases : [])]) {
          taken.set(name, `default:${doc.key}`);
        }
      }
      config.commands.forEach((command, index) => {
        for (const name of [command.name, ...command.aliases]) {
          const owner = taken.get(name);
          if (owner?.startsWith('default:')) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['commands', index, 'name'],
              message: `!${name} is a default command (turn that off first).`,
            });
          } else if (owner !== undefined && owner !== command.id) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['commands', index, 'name'],
              message: `!${name} is used by two commands.`,
            });
          }
          taken.set(name, command.id);
        }
      });
      for (const [list, label] of [
        [config.timers, 'timers'],
        [config.keywords, 'keywords'],
        [config.blockedTerms.terms, 'blockedTerms'],
      ] as const) {
        const ids = new Set<string>();
        list.forEach((item, index) => {
          if (ids.has(item.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [label, index, 'id'],
              message: 'Duplicate entry.',
            });
          }
          ids.add(item.id);
        });
      }
      config.blockedTerms.terms.forEach((term, index) => {
        if (term.regex && !isValidRegex(term.phrase)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['blockedTerms', 'terms', index, 'phrase'],
            message: `“${term.phrase}” isn’t a valid regex.`,
          });
        }
      });
    }),
);
export type TwitchChatConfig = z.infer<typeof twitchChatConfigSchema>;

/** Settings sections a dashboard page saves on its own. */
export const TWITCH_SECTIONS = [
  'channel',
  'commands',
  'defaults',
  'timers',
  'keywords',
  'filters',
  'blockedTerms',
  'alerts',
  'alertOptions',
  'quotes',
  'songs',
  'fun',
  'integrations',
] as const satisfies readonly (keyof TwitchChatConfig)[];
export type TwitchSection = (typeof TWITCH_SECTIONS)[number];

export function isValidRegex(source: string): boolean {
  try {
    new RegExp(source.replace(/^\/(.*)\/([a-z]*)$/, '$1'));
    return true;
  } catch {
    return false;
  }
}

// ── OAuth scopes ────────────────────────────────────────────────────────────

/** Scopes the bot's Twitch account grants when connected on the dashboard. */
export const TWITCH_BOT_SCOPES = [
  'user:read:chat',
  'user:write:chat',
  'user:bot',
  'user:read:moderated_channels',
  'user:manage:whispers',
  'moderator:manage:chat_messages',
  'moderator:manage:banned_users',
  'moderator:read:followers',
  'moderator:read:chatters',
  'moderator:manage:shoutouts',
  'clips:edit',
] as const;

/** Scopes the broadcaster grants for alerts and !settitle / !setgame. */
export const TWITCH_BROADCASTER_SCOPES = [
  'channel:manage:broadcast',
  'channel:read:subscriptions',
  'bits:read',
  'channel:read:hype_train',
  'channel:read:polls',
  'channel:read:predictions',
  'channel:read:charity',
  'channel:read:ads',
  'channel:read:redemptions',
] as const;

/** Readable problems for the dashboard (the schema covers the rest). */
export function twitchChatConfigProblems(config: unknown): string[] {
  const parsed = twitchChatConfigSchema.safeParse(config);
  if (parsed.success) return [];
  const data = (config ?? {}) as Partial<TwitchChatConfig>;
  return parsed.error.issues.slice(0, 5).map((issue) => {
    const [section, index] = issue.path;
    if (section === 'commands' && typeof index === 'number') {
      const name = data.commands?.[index]?.name;
      return `Command ${name ? `!${name}` : `#${index + 1}`}: ${issue.message}`;
    }
    if (section === 'timers' && typeof index === 'number') {
      return `Timer “${data.timers?.[index]?.name ?? index + 1}”: ${issue.message}`;
    }
    if (section === 'keywords' && typeof index === 'number') {
      return `Keyword “${data.keywords?.[index]?.name ?? index + 1}”: ${issue.message}`;
    }
    return issue.message;
  });
}
