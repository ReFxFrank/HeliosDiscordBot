import {
  TWITCH_DEFAULTS,
  TWITCH_PERMISSIONS,
  twitchCanUse,
  twitchLevelFromBadges,
  twitchPermissionRank,
  type TwitchChatConfig,
  type TwitchCommand,
  type TwitchDefaultKey,
  type TwitchFilterKey,
  type TwitchPermission,
  type TwitchResponseType,
} from '@refx/shared';
import { safeFetchText } from '../lib/safeFetch';
import {
  bttvEmotes,
  dadJoke,
  dictionary,
  eightBall,
  emoteList,
  ffzEmotes,
  randomFact,
  sevenTvEmotes,
  urban,
} from '../lib/twitchChat/external';
import { checkFilters, findBlockedTerm, RepeatTracker } from '../lib/twitchChat/filters';
import { keywordMatches } from '../lib/twitchChat/keywords';
import { parseDuration, parseNuke, type NukeSpec } from '../lib/twitchChat/nuke';
import {
  formatDate,
  formatFollowAge,
  formatSpan,
  formatUptime,
  renderTwitchTemplate,
  stripAt,
} from '../lib/twitchChat/variables';
import {
  addCounter,
  addQuote,
  deleteQuote,
  editQuote,
  findQuote,
  formatQuote,
  getCounter,
  setCounter,
  updateTwitchConfig,
} from './twitchChatData';
import type { ChannelState, ChatEvent, ChatRuntime, Chatter } from './twitchChatRuntime';
import { handleSongCommand } from './twitchChatSongs';

/**
 * Everything that happens when a chat message arrives: nuke radiation,
 * blocked terms, spam filters, default and custom commands, then keywords.
 */

const repeats = new RepeatTracker();

const isStaff = (level: TwitchPermission) =>
  twitchPermissionRank(level) >= twitchPermissionRank('moderator');

/** Text without emotes/cheermotes (Twitch sends them as separate fragments). */
function plainText(event: ChatEvent): { text: string; emotes: number } {
  const fragments = event.message.fragments ?? [{ type: 'text', text: event.message.text }];
  let emotes = 0;
  const text = fragments
    .filter((fragment) => {
      const isEmote = fragment.type === 'emote' || fragment.type === 'cheermote';
      if (isEmote) emotes++;
      return !isEmote;
    })
    .map((fragment) => fragment.text)
    .join('')
    .trim();
  return { text, emotes };
}

export async function handleChatMessage(
  rt: ChatRuntime,
  state: ChannelState,
  event: ChatEvent,
): Promise<void> {
  const level = twitchLevelFromBadges((event.badges ?? []).map((b) => b.set_id));
  const chatter: Chatter = {
    id: event.chatter_user_id,
    login: event.chatter_user_login,
    name: event.chatter_user_name,
    level,
    messageId: event.message_id,
  };
  const now = Date.now();
  state.history.add({
    messageId: event.message_id,
    userId: chatter.id,
    login: chatter.login,
    text: event.message.text,
    at: now,
    exempt: isStaff(level),
  });
  for (const timer of state.config.timers) {
    state.timerLines.set(timer.id, (state.timerLines.get(timer.id) ?? 0) + 1);
  }

  if (!isStaff(level)) {
    if (await applyRadiation(rt, state, chatter, event.message.text)) return;
    if (await applyBlockedTerms(rt, state, chatter, event.message.text)) return;
    if (await applyFilters(rt, state, chatter, event)) return;
  }

  let text = event.message.text.trim();
  // A reply's text starts with "@parent "; drop it so "!cmd" still matches.
  if (event.reply?.parent_user_login) text = text.replace(/^@\S+\s+/, '');
  if (text.startsWith('!')) {
    const [rawName = '', ...args] = text.slice(1).split(/\s+/);
    const name = rawName.toLowerCase();
    if (name && (await runCommand(rt, state, chatter, name, args))) return;
  }
  await runKeywords(rt, state, chatter, event.message.text);
}

// ── Moderation ──────────────────────────────────────────────────────────────

async function applyRadiation(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  text: string,
): Promise<boolean> {
  const now = Date.now();
  state.radiation = state.radiation.filter((r) => r.until > now);
  for (const radiation of state.radiation) {
    if (!radiation.spec.pattern.test(text)) continue;
    radiation.hit.add(chatter.id);
    await nukeAct(rt, state, radiation.spec, {
      id: chatter.id,
      login: chatter.login,
      messageId: chatter.messageId,
    });
    return true;
  }
  return false;
}

async function applyBlockedTerms(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  text: string,
): Promise<boolean> {
  const term = findBlockedTerm(state.blocked, text);
  if (!term) return false;
  const reason = term.reason || 'Blocked term';
  const done = await rt.punish(state, chatter, term.action, term.timeoutSeconds, reason);
  await rt.log(state, {
    kind: 'blocked_term',
    action: term.action,
    detail: `${reason}: “${text.slice(0, 200)}”`,
    userLogin: chatter.login,
    userId: chatter.id,
    actor: 'bot',
    data: { term: term.phrase, done },
  });
  const message = state.config.blockedTerms.message;
  if (done && message) {
    await rt.say(state, await renderTwitchTemplate(message, rt.variables(state, chatter, [])));
  }
  return true;
}

async function applyFilters(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  event: ChatEvent,
): Promise<boolean> {
  const filters = state.config.filters;
  if (twitchPermissionRank(chatter.level) >= twitchPermissionRank(filters.exempt)) return false;
  const { text, emotes } = plainText(event);
  const permitUntil = state.permits.get(chatter.login) ?? 0;
  const hit = checkFilters(filters, {
    text,
    emotes,
    repeats: filters.repeat.enabled
      ? repeats.record(`${state.broadcasterId}:${chatter.id}`, event.message.text)
      : 0,
    permitted: permitUntil > Date.now(),
    isSubscriber: twitchPermissionRank(chatter.level) >= twitchPermissionRank('subscriber'),
    nameLength: chatter.name.length,
  });
  if (!hit) return false;
  await punishFilter(rt, state, chatter, hit, event.message.text);
  return true;
}

async function punishFilter(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  key: TwitchFilterKey,
  text: string,
): Promise<void> {
  const filters = state.config.filters;
  const filter = filters[key];
  const now = Date.now();
  const last = state.offences.get(chatter.id);
  const escalation = filters.escalation;
  const warning =
    escalation.enabled && (last === undefined || now - last > escalation.windowMinutes * 60_000);
  state.offences.set(chatter.id, now);
  if (state.offences.size > 10_000) {
    for (const [id, at] of state.offences) {
      if (now - at > escalation.windowMinutes * 60_000) state.offences.delete(id);
    }
  }

  const reason = `Spam filter: ${key}`;
  const done = warning
    ? escalation.warningTimeout > 0
      ? await rt.punish(state, chatter, 'timeout', escalation.warningTimeout, `${reason} (warning)`)
      : await rt.punish(state, chatter, 'delete', 0, reason)
    : await rt.punish(state, chatter, filter.action, filter.timeoutSeconds, reason);
  await rt.log(state, {
    kind: 'filter',
    action: warning ? 'warning' : filter.action,
    detail: `${key}: “${text.slice(0, 200)}”`,
    userLogin: chatter.login,
    userId: chatter.id,
    actor: 'bot',
    data: { filter: key, done },
  });
  if (!done || !filter.message) return;
  // One message per chatter per filter every 30s, so spam doesn't make the bot spam.
  const coolKey = `w:${key}:${chatter.id}`;
  if ((state.cooldowns.get(coolKey) ?? 0) > now) return;
  state.cooldowns.set(coolKey, now + 30_000);
  const message = await renderTwitchTemplate(filter.message, rt.variables(state, chatter, []));
  await rt.say(state, warning ? `${message} [warning]` : message);
}

// ── Commands ────────────────────────────────────────────────────────────────

const DEFAULT_BY_NAME = new Map<string, (typeof TWITCH_DEFAULTS)[number]>();
for (const doc of TWITCH_DEFAULTS) {
  DEFAULT_BY_NAME.set(doc.name, doc);
  for (const alias of 'aliases' in doc ? doc.aliases : []) DEFAULT_BY_NAME.set(alias, doc);
}

/** Cooldown check shared by commands and keywords; staff skip cooldowns. */
function cooledDown(
  state: ChannelState,
  chatter: Chatter,
  key: string,
  global: number,
  perUser: number,
): boolean {
  if (isStaff(chatter.level)) return true;
  const now = Date.now();
  const userKey = `${key}:${chatter.id}`;
  if ((state.cooldowns.get(key) ?? 0) > now || (state.cooldowns.get(userKey) ?? 0) > now)
    return false;
  if (global > 0) state.cooldowns.set(key, now + global * 1000);
  if (perUser > 0) state.cooldowns.set(userKey, now + perUser * 1000);
  if (state.cooldowns.size > 10_000) {
    for (const [k, until] of state.cooldowns) if (until < now) state.cooldowns.delete(k);
  }
  return true;
}

async function runCommand(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  name: string,
  args: string[],
): Promise<boolean> {
  const doc = DEFAULT_BY_NAME.get(name);
  if (doc) {
    const setting = state.config.defaults[doc.key];
    if (setting.enabled) {
      if (!twitchCanUse(chatter.level, setting.permission)) return true;
      if (!cooledDown(state, chatter, `d:${doc.key}`, setting.cooldown, 0)) return true;
      await runDefault(rt, state, chatter, doc.key, args);
      return true;
    }
  }
  const command = state.config.commands.find(
    (c) => c.enabled && (c.name === name || c.aliases.includes(name)),
  );
  if (!command) return false;
  await runCustom(rt, state, chatter, command, args);
  return true;
}

async function runCustom(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  command: TwitchCommand,
  args: string[],
): Promise<void> {
  if (command.expiresAt && Date.parse(command.expiresAt) <= Date.now()) {
    await updateTwitchConfig(state.guildId, (config) => ({
      ...config,
      commands:
        command.expireAction === 'delete'
          ? config.commands.filter((c) => c.id !== command.id)
          : config.commands.map((c) => (c.id === command.id ? { ...c, enabled: false } : c)),
    }));
    return;
  }
  if (!twitchCanUse(chatter.level, command.permission)) return;
  if (state.live ? !command.whenLive : !command.whenOffline) return;
  const vars = rt.variables(state, chatter, args, { commandId: command.id });
  if (!cooledDown(state, chatter, `c:${command.id}`, command.cooldown, command.userCooldown)) {
    if (command.whisperOnCooldown) {
      await rt.respond(
        state,
        chatter,
        await renderTwitchTemplate(command.response, vars),
        'whisper',
      );
    }
    return;
  }
  await rt.respond(
    state,
    chatter,
    await renderTwitchTemplate(command.response, vars),
    command.responseType,
  );
}

async function runKeywords(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  text: string,
): Promise<void> {
  for (const compiled of state.keywords) {
    const keyword = compiled.keyword;
    if (!twitchCanUse(chatter.level, keyword.permission)) continue;
    if (state.live ? !keyword.whenLive : !keyword.whenOffline) continue;
    if (!keywordMatches(compiled, text, chatter.login)) continue;
    if (!cooledDown(state, chatter, `k:${keyword.id}`, keyword.cooldown, keyword.userCooldown))
      return;
    const message = await renderTwitchTemplate(
      keyword.response,
      rt.variables(state, chatter, text.split(/\s+/)),
    );
    await rt.respond(state, chatter, message, keyword.responseType);
    return;
  }
}

// ── Default commands ────────────────────────────────────────────────────────

const LEVEL_ALIASES: Record<string, TwitchPermission> = {
  everyone: 'everyone',
  all: 'everyone',
  sub: 'subscriber',
  subs: 'subscriber',
  subscriber: 'subscriber',
  vip: 'vip',
  mod: 'moderator',
  mods: 'moderator',
  moderator: 'moderator',
  owner: 'broadcaster',
  broadcaster: 'broadcaster',
  streamer: 'broadcaster',
};

const RESPONSE_TYPES: Record<string, TwitchResponseType> = {
  say: 'say',
  mention: 'mention',
  reply: 'reply',
  whisper: 'whisper',
};

/** Leading -ul=mod -cd=30 -type=reply options in a chat-made command. */
function parseCommandOptions(words: string[]): {
  options: Partial<
    Pick<TwitchCommand, 'permission' | 'cooldown' | 'userCooldown' | 'responseType'>
  >;
  rest: string[];
  error?: string;
} {
  const options: Partial<
    Pick<TwitchCommand, 'permission' | 'cooldown' | 'userCooldown' | 'responseType'>
  > = {};
  let i = 0;
  for (; i < words.length; i++) {
    const match = words[i]?.match(/^-(ul|userlevel|cd|cooldown|ucd|type)=(\S+)$/i);
    if (!match?.[1] || !match[2]) break;
    const key = match[1].toLowerCase();
    const value = match[2].toLowerCase();
    if (key === 'ul' || key === 'userlevel') {
      const level = LEVEL_ALIASES[value];
      if (!level)
        return {
          options,
          rest: [],
          error: `Unknown level “${value}”. Use ${TWITCH_PERMISSIONS.join(', ')}.`,
        };
      options.permission = level;
    } else if (key === 'type') {
      const type = RESPONSE_TYPES[value];
      if (!type) return { options, rest: [], error: 'Type is say, mention, reply or whisper.' };
      options.responseType = type;
    } else {
      const seconds = parseDuration(value);
      if (seconds === null) return { options, rest: [], error: `“${value}” isn’t a time.` };
      if (key === 'ucd') options.userCooldown = seconds;
      else options.cooldown = seconds;
    }
  }
  return { options, rest: words.slice(i) };
}

async function manageCommand(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  mode: 'add' | 'edit' | 'set' | 'del',
  args: string[],
): Promise<void> {
  const reply = (message: string) => rt.respond(state, chatter, message, 'mention');
  const name = (args[0] ?? '').replace(/^!+/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,30}$/.test(name)) {
    await reply(
      `Usage: !${mode === 'del' ? 'delcmd <name>' : `${mode}cmd <name> [-ul=mod -cd=10] <response>`}`,
    );
    return;
  }
  const existing = state.config.commands.find((c) => c.name === name || c.aliases.includes(name));
  if (mode === 'del') {
    if (!existing) {
      await reply(`!${name} doesn’t exist.`);
      return;
    }
    const error = await updateTwitchConfig(state.guildId, (config) => ({
      ...config,
      commands: config.commands.filter((c) => c.id !== existing.id),
    }));
    await reply(error ?? `Deleted !${existing.name}.`);
    if (!error)
      await rt.log(state, {
        kind: 'command',
        action: 'remove',
        detail: `!${existing.name}`,
        actor: chatter.login,
      });
    return;
  }
  const { options, rest, error: optionError } = parseCommandOptions(args.slice(1));
  if (optionError) {
    await reply(optionError);
    return;
  }
  const response = rest.join(' ').trim();
  if (!response && !(mode === 'edit' && Object.keys(options).length > 0)) {
    await reply(`Usage: !${mode}cmd <name> [-ul=mod -cd=10] <response>`);
    return;
  }
  if (mode === 'add' && existing) {
    await reply(`!${name} already exists. Use !editcmd.`);
    return;
  }
  if (mode === 'edit' && !existing) {
    await reply(`!${name} doesn’t exist. Use !addcmd.`);
    return;
  }
  const error = await updateTwitchConfig(state.guildId, (config) => {
    if (existing) {
      return {
        ...config,
        commands: config.commands.map((c) =>
          c.id === existing.id ? { ...c, ...options, ...(response ? { response } : {}) } : c,
        ),
      };
    }
    const command: TwitchCommand = {
      id: `cmd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name,
      aliases: [],
      response,
      permission: options.permission ?? 'everyone',
      responseType: options.responseType ?? 'say',
      cooldown: options.cooldown ?? 5,
      userCooldown: options.userCooldown ?? 15,
      whenLive: true,
      whenOffline: true,
      hidden: false,
      whisperOnCooldown: false,
      expiresAt: null,
      expireAction: 'disable',
      enabled: true,
      createdBy: chatter.login,
    };
    return { ...config, commands: [...config.commands, command] };
  });
  await reply(error ?? `${existing ? 'Updated' : 'Added'} !${name}.`);
  if (!error) {
    await rt.log(state, {
      kind: 'command',
      action: existing ? 'edit' : 'add',
      detail: `!${name}${response ? `: ${response}` : ''}`,
      actor: chatter.login,
    });
  }
}

/** !cmd add|edit|del|show|alias|cooldown|level|enable|disable <name> … */
async function cmdSystem(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  args: string[],
): Promise<void> {
  const reply = (message: string) => rt.respond(state, chatter, message, 'mention');
  const [sub = '', rawName = '', ...rest] = args;
  const action = sub.toLowerCase();
  if (action === 'add' || action === 'edit' || action === 'set') {
    await manageCommand(rt, state, chatter, action, [rawName, ...rest]);
    return;
  }
  if (action === 'del' || action === 'delete' || action === 'remove') {
    await manageCommand(rt, state, chatter, 'del', [rawName]);
    return;
  }
  const name = rawName.replace(/^!+/, '').toLowerCase();
  const command = state.config.commands.find((c) => c.name === name || c.aliases.includes(name));
  if (!command) {
    await reply('Usage: !cmd add|edit|del|show|alias|cooldown|level|enable|disable <name> …');
    return;
  }
  const patch = (change: Partial<TwitchCommand>, done: string) =>
    updateTwitchConfig(state.guildId, (config) => ({
      ...config,
      commands: config.commands.map((c) => (c.id === command.id ? { ...c, ...change } : c)),
    })).then((error) => reply(error ?? done));

  switch (action) {
    case 'show':
      await reply(
        `!${command.name} [${command.permission}, ${command.cooldown}s]: ${command.response}`,
      );
      return;
    case 'alias': {
      const alias = (rest[0] ?? '').replace(/^!+/, '').toLowerCase();
      if (!alias) return void (await reply('Usage: !cmd alias <name> <alias>'));
      await patch(
        { aliases: [...new Set([...command.aliases, alias])] },
        `!${alias} now runs !${command.name}.`,
      );
      return;
    }
    case 'cooldown':
    case 'cd': {
      const seconds = parseDuration(rest[0] ?? '');
      if (seconds === null) return void (await reply('Usage: !cmd cooldown <name> <seconds>'));
      await patch({ cooldown: seconds }, `!${command.name} cooldown is now ${seconds}s.`);
      return;
    }
    case 'level':
    case 'ul': {
      const level = LEVEL_ALIASES[(rest[0] ?? '').toLowerCase()];
      if (!level) return void (await reply('Usage: !cmd level <name> everyone|sub|vip|mod|owner'));
      await patch({ permission: level }, `!${command.name} is now for ${level}.`);
      return;
    }
    case 'enable':
    case 'disable':
      await patch({ enabled: action === 'enable' }, `!${command.name} ${action}d.`);
      return;
    default:
      await reply('Usage: !cmd add|edit|del|show|alias|cooldown|level|enable|disable <name> …');
  }
}

async function runDefault(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  key: TwitchDefaultKey,
  args: string[],
): Promise<void> {
  const say = (message: string) => rt.say(state, message);
  const mention = (message: string) => rt.respond(state, chatter, message, 'mention');
  const target = stripAt(args[0] ?? '').toLowerCase();
  const config = state.config;

  switch (key) {
    case 'commands': {
      const names = config.commands
        .filter((c) => c.enabled && !c.hidden && c.permission === 'everyone')
        .map((c) => `!${c.name}`);
      const url = rt.dashboardUrl(`/commands/${state.guildId}`);
      await say(
        names.length
          ? `Commands: ${names.join(', ')}`.slice(0, 480)
          : `There are no custom commands yet.${url ? ` ${url}` : ''}`,
      );
      return;
    }
    case 'game': {
      const info = await rt.channel(state);
      await say(info?.game_name ? `Current category: ${info.game_name}` : 'No category is set.');
      return;
    }
    case 'title': {
      const info = await rt.channel(state);
      await say(info?.title ? `Current title: ${info.title}` : 'No title is set.');
      return;
    }
    case 'uptime': {
      const stream = await rt.stream(state);
      await say(
        stream
          ? `${state.login} has been live for ${formatUptime(Date.now() - Date.parse(stream.started_at))}.`
          : `${state.login} is offline.`,
      );
      return;
    }
    case 'downtime':
    case 'gamesplayed':
    case 'ping': {
      const vars = rt.variables(state, chatter, args);
      const value = await vars.lookup?.(key === 'ping' ? 'botuptime' : key, '', vars);
      if (key === 'ping') await say(`Pong! I’ve been running for ${value}.`);
      else if (key === 'downtime')
        await say(
          state.live
            ? `${state.login} is live right now.`
            : `${state.login} has been offline for ${value}.`,
        );
      else await say(value ? `Played this stream: ${value}` : 'Nothing tracked this stream yet.');
      return;
    }
    case 'followage':
    case 'followdate':
    case 'accountage':
    case 'accountdate': {
      const who = target || chatter.login;
      const [user] =
        who === chatter.login
          ? [{ id: chatter.id, login: chatter.login, created_at: undefined }]
          : await rt.helix.usersByLogin([who]);
      if (!user) return void (await mention(`There’s no Twitch user called ${who}.`));
      if (key === 'accountage' || key === 'accountdate') {
        const created = user.created_at ?? (await rt.helix.usersById([user.id]))[0]?.created_at;
        if (!created) return void (await mention('Twitch didn’t answer.'));
        const date = new Date(created);
        await say(
          key === 'accountage'
            ? `${who} created their account ${formatFollowAge(date)} ago.`
            : `${who} created their account on ${formatDate(date)}.`,
        );
        return;
      }
      if (user.login === state.login)
        return void (await mention(`${state.login} can’t follow themselves.`));
      const at = await rt.helix.followedAt(state.broadcasterId, user.id);
      if (at === undefined) return void (await mention('Twitch didn’t answer, try again.'));
      if (at === null) return void (await say(`${who} isn’t following ${state.login}.`));
      await say(
        key === 'followage'
          ? `${who} has been following ${state.login} for ${formatFollowAge(at)}.`
          : `${who} followed ${state.login} on ${formatDate(at)}.`,
      );
      return;
    }
    case 'eightball':
      await mention(args.length ? eightBall() : 'Ask me a question.');
      return;
    case 'dadjoke':
      await say(await dadJoke());
      return;
    case 'fact':
      await say(await randomFact());
      return;
    case 'dictionary':
      await say(await dictionary(args.join(' ')));
      return;
    case 'urban':
      await say(await urban(args.join(' ')));
      return;
    case 'emotes': {
      const [twitch, seven, bttv, ffz] = await Promise.all([
        rt.helix.channelEmotes(state.broadcasterId),
        sevenTvEmotes(state.broadcasterId),
        bttvEmotes(state.broadcasterId),
        ffzEmotes(state.broadcasterId),
      ]);
      const parts = [
        twitch.length ? `Twitch: ${twitch.join(' ')}` : '',
        seven.length ? `7TV: ${seven.join(' ')}` : '',
        bttv.length ? `BTTV: ${bttv.join(' ')}` : '',
        ffz.length ? `FFZ: ${ffz.join(' ')}` : '',
      ].filter(Boolean);
      await say(
        parts.length ? emoteList('', [parts.join(' · ')]) : 'This channel has no emotes yet.',
      );
      return;
    }
    case 'clip': {
      if (!state.live) return void (await mention('Clips only work while live.'));
      const url = await rt.helix.createClip(state.broadcasterId);
      await say(url ? `Clip: ${url}` : 'Twitch couldn’t make a clip right now.');
      return;
    }
    case 'vanish':
      if (!isStaff(chatter.level)) await rt.punish(state, chatter, 'timeout', 1, 'Vanish');
      return;
    case 'votekick': {
      if (!target) return void (await mention('Usage: !votekick <user>'));
      const now = Date.now();
      if (!state.votekick || state.votekick.until < now || state.votekick.target !== target) {
        const [user] = await rt.helix.usersByLogin([target]);
        if (!user) return void (await mention(`There’s no Twitch user called ${target}.`));
        if (user.id === state.broadcasterId || user.id === rt.bot.id) return;
        state.votekick = { targetId: user.id, target, voters: new Set(), until: now + 60_000 };
      }
      const vote = state.votekick;
      vote.voters.add(chatter.id);
      if (vote.voters.size >= config.fun.votekickVotes) {
        state.votekick = null;
        const done = await rt.punish(
          state,
          { id: vote.targetId, login: vote.target },
          'timeout',
          config.fun.votekickSeconds,
          'Vote kick',
        );
        await say(
          done
            ? `Chat has spoken: ${vote.target} is timed out for ${config.fun.votekickSeconds}s.`
            : `${vote.target} can’t be timed out.`,
        );
      } else {
        await say(
          `Vote to kick ${vote.target}: ${vote.voters.size}/${config.fun.votekickVotes}. Type !votekick ${vote.target} to vote.`,
        );
      }
      return;
    }
    case 'quote':
      await quoteCommand(rt, state, chatter, args);
      return;
    case 'song':
    case 'sr':
    case 'queue':
    case 'wrongsong':
    case 'voteskip':
    case 'skip':
    case 'volume':
    case 'clearqueue':
      await handleSongCommand(rt, state, chatter, key, args);
      return;
    case 'cmd':
      await cmdSystem(rt, state, chatter, args);
      return;
    case 'addcmd':
      await manageCommand(rt, state, chatter, 'add', args);
      return;
    case 'editcmd':
      await manageCommand(rt, state, chatter, 'edit', args);
      return;
    case 'setcommand':
      await manageCommand(rt, state, chatter, 'set', args);
      return;
    case 'delcmd':
      await manageCommand(rt, state, chatter, 'del', args);
      return;
    case 'count':
      await countCommand(rt, state, chatter, args);
      return;
    case 'permit': {
      if (!target) return void (await mention('Usage: !permit <user> [seconds]'));
      const seconds = Math.min(parseDuration(args[1] ?? '') ?? 60, 3600);
      state.permits.set(target, Date.now() + seconds * 1000);
      await say(`${target} can post links for the next ${formatSpan(seconds * 1000)}.`);
      return;
    }
    case 'nuke':
      await nukeCommand(rt, state, chatter, args);
      return;
    case 'so': {
      if (!target) return void (await mention('Usage: !so <user>'));
      await shoutout(rt, state, target);
      return;
    }
    case 'filesay':
      await fileSay(rt, state, chatter, args[0] ?? '');
      return;
    case 'filesaystop':
      if (state.filesay) {
        state.filesay.cancelled = true;
        await mention('Stopped.');
      }
      return;
    case 'settitle':
    case 'setgame': {
      const value = args.join(' ').trim();
      if (!value)
        return void (await mention(
          `Usage: !${key} <${key === 'settitle' ? 'title' : 'category'}>`,
        ));
      const owner = await rt.broadcasterHelix(state);
      if (!owner)
        return void (await mention(
          `${state.login} needs to connect their Twitch on the dashboard for this.`,
        ));
      if (key === 'settitle') {
        const ok = await owner.modifyChannel(state.broadcasterId, { title: value.slice(0, 140) });
        state.channelInfo = null;
        await mention(
          ok ? `Title set to: ${value.slice(0, 140)}` : 'Twitch didn’t change the title.',
        );
      } else {
        const category = await owner.searchCategory(value);
        if (!category) return void (await mention(`No category called “${value}”.`));
        const ok = await owner.modifyChannel(state.broadcasterId, { game_id: category.id });
        state.channelInfo = null;
        await mention(
          ok ? `Category set to ${category.name}.` : 'Twitch didn’t change the category.',
        );
      }
      return;
    }
  }
}

export async function shoutout(rt: ChatRuntime, state: ChannelState, login: string): Promise<void> {
  const [other] = await rt.helix.usersByLogin([login]);
  if (!other) {
    await rt.say(state, `There’s no Twitch user called ${login}.`);
    return;
  }
  const info = await rt.helix.channel(other.id);
  const game = info?.game_name ? ` They were last playing ${info.game_name}.` : '';
  await rt.say(
    state,
    `Go show some love to ${other.display_name} at https://twitch.tv/${other.login} !${game}`,
  );
  // Twitch's own shoutout card; only works while live and is rate limited.
  await rt.helix.shoutout(state.broadcasterId, other.id, rt.bot.id);
}

async function quoteCommand(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  args: string[],
): Promise<void> {
  const mention = (message: string) => rt.respond(state, chatter, message, 'mention');
  const [sub = '', ...rest] = args;
  const action = sub.toLowerCase();
  if (action === 'add') {
    if (!twitchCanUse(chatter.level, state.config.quotes.addPermission)) return;
    const text = rest.join(' ').trim();
    if (!text) return void (await mention('Usage: !quote add <text>'));
    const game = (await rt.channel(state))?.game_name || null;
    const quote = await addQuote(state.guildId, text.slice(0, 400), game, chatter.login);
    await mention(`Added quote #${quote.number}.`);
    await rt.log(state, {
      kind: 'quote',
      action: 'add',
      detail: `#${quote.number}: ${quote.text}`,
      actor: chatter.login,
    });
    return;
  }
  if (action === 'edit' || action === 'del' || action === 'delete' || action === 'remove') {
    if (!isStaff(chatter.level)) return;
    const number = Number((rest[0] ?? '').replace('#', ''));
    if (!Number.isInteger(number) || number < 1)
      return void (await mention(
        `Usage: !quote ${action} <number>${action === 'edit' ? ' <text>' : ''}`,
      ));
    if (action === 'edit') {
      const text = rest.slice(1).join(' ').trim();
      if (!text) return void (await mention('Usage: !quote edit <number> <text>'));
      const ok = await editQuote(state.guildId, number, text.slice(0, 400));
      await mention(ok ? `Quote #${number} updated.` : `There’s no quote #${number}.`);
    } else {
      const ok = await deleteQuote(state.guildId, number);
      await mention(ok ? `Quote #${number} deleted.` : `There’s no quote #${number}.`);
    }
    await rt.log(state, {
      kind: 'quote',
      action: action === 'edit' ? 'edit' : 'remove',
      detail: `#${number}`,
      actor: chatter.login,
    });
    return;
  }
  const quote = await findQuote(state.guildId, args.join(' ').trim());
  await rt.say(
    state,
    quote
      ? formatQuote(quote)
      : args.length
        ? 'No quote matches that.'
        : 'There are no quotes yet. Mods can add one with !quote add <text>.',
  );
}

async function countCommand(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  args: string[],
): Promise<void> {
  const mention = (message: string) => rt.respond(state, chatter, message, 'mention');
  const name = (args[0] ?? '').toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(name))
    return void (await mention('Usage: !count <name> [+n|-n|=n|reset]'));
  const op = args[1] ?? '';
  let value: number;
  if (!op) value = await getCounter(state.guildId, name);
  else if (op === 'reset') value = await setCounter(state.guildId, name, 0);
  else {
    const match = op.match(/^([+\-=])?(\d{1,9})$/);
    if (!match?.[2]) return void (await mention('Usage: !count <name> [+n|-n|=n|reset]'));
    const n = Number(match[2]);
    value =
      match[1] === '='
        ? await setCounter(state.guildId, name, n)
        : await addCounter(state.guildId, name, match[1] === '-' ? -n : n);
  }
  await rt.say(state, `${name}: ${value}`);
}

async function fileSay(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  url: string,
): Promise<void> {
  const mention = (message: string) => rt.respond(state, chatter, message, 'mention');
  if (!/^https?:\/\//i.test(url))
    return void (await mention('Usage: !filesay <link to a .txt file>'));
  if (state.filesay)
    return void (await mention('A !filesay is already running. Use !filesaystop.'));
  let text: string;
  try {
    text = await safeFetchText(url, { maxBytes: 64 * 1024, timeoutMs: 8000 });
  } catch {
    return void (await mention('I couldn’t read that file.'));
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
  const run = { cancelled: false };
  state.filesay = run;
  for (const line of lines) {
    if (run.cancelled) break;
    await rt.say(state, line);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (state.filesay === run) state.filesay = null;
}

// ── Nukes ───────────────────────────────────────────────────────────────────

async function nukeAct(
  rt: ChatRuntime,
  state: ChannelState,
  spec: NukeSpec,
  chatter: { id: string; login: string; messageId?: string },
): Promise<boolean> {
  const action = spec.action;
  return rt.punish(
    state,
    chatter,
    action.kind,
    action.kind === 'timeout' ? action.seconds : 0,
    `Nuke: ${spec.label}`.slice(0, 200),
  );
}

/** Run a nuke (from chat or the dashboard) and log it for rollback. */
export async function runNuke(
  rt: ChatRuntime,
  state: ChannelState,
  spec: NukeSpec,
  actor: string,
): Promise<{ count: number; logId: string | null }> {
  const lines = state.history
    .since(spec.scrollback * 1000)
    .filter((line) => !line.exempt && line.userId !== rt.bot.id && spec.pattern.test(line.text));
  const hit = new Map<string, { id: string; login: string }>();
  for (const line of lines) {
    if (spec.action.kind === 'delete') {
      await rt.punish(
        state,
        { id: line.userId, login: line.login, messageId: line.messageId },
        'delete',
        0,
        `Nuke: ${spec.label}`,
      );
      hit.set(line.userId, { id: line.userId, login: line.login });
    } else if (!hit.has(line.userId)) {
      hit.set(line.userId, { id: line.userId, login: line.login });
      await nukeAct(rt, state, spec, { id: line.userId, login: line.login });
    }
  }
  const logId = await rt.log(state, {
    kind: 'nuke',
    action: spec.action.kind,
    detail: `${spec.label} — ${hit.size} chatter${hit.size === 1 ? '' : 's'}${spec.radiation ? `, radiation ${formatSpan(spec.radiation * 1000)}` : ''}`,
    actor,
    data: {
      phrase: spec.label,
      action: spec.action.kind,
      seconds: spec.action.kind === 'timeout' ? spec.action.seconds : null,
      users: [...hit.values()],
    },
  });
  if (spec.radiation > 0) {
    state.radiation.push({
      spec,
      until: Date.now() + spec.radiation * 1000,
      logId,
      hit: new Set(hit.keys()),
    });
  }
  return { count: hit.size, logId };
}

async function nukeCommand(
  rt: ChatRuntime,
  state: ChannelState,
  chatter: Chatter,
  args: string[],
): Promise<void> {
  const parsed = parseNuke(args);
  if ('error' in parsed) {
    await rt.respond(state, chatter, parsed.error, 'mention');
    return;
  }
  const { count } = await runNuke(rt, state, parsed, chatter.login);
  const where = rt.dashboardUrl(`/servers/${state.guildId}/twitch/controls`);
  await rt.respond(
    state,
    chatter,
    `Nuked ${count} chatter${count === 1 ? '' : 's'} for “${parsed.label}”.${parsed.radiation ? ` Radiation active for ${formatSpan(parsed.radiation * 1000)}.` : ''}${where ? ' Undo it from Bot Controls on the dashboard.' : ''}`,
    'whisper',
  );
}

export type { TwitchChatConfig };
