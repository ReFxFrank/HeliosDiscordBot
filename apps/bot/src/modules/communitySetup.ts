import { ChannelType, type Guild } from 'discord.js';
import type { Prisma } from '@refx/database';
import {
  REDIS_CHANNELS,
  parseModuleConfig,
  type Module,
  type ModuleWithSchema,
} from '@refx/shared';
import { env } from '../env';
import { platformAvailable } from '../lib/social';
import type { BotContext } from '../framework/context';
import { baselineSubscription, scheduleSocialPoll } from './social';

/**
 * `/community-setup`: the stream-community counterpart of `/refx-setup`. It
 * looks for channels and roles by the names communities usually give them
 * (emoji and separators ignored, so "🎉・welcome" matches "welcome"), points the
 * modules at whatever it finds and turns those modules on. Anything it cannot
 * find is reported and left alone, existing settings are only overwritten for
 * the fields it sets, and it never posts or creates anything in the server, so
 * it is safe to re-run after renaming or adding channels.
 */

/** Lowercase letters/digits only: "🎉・welcome" → "welcome". */
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Best match for a list of candidate names: exact first, then "contains". */
function pick(index: Map<string, string>, candidates: string[]): string | null {
  for (const name of candidates) {
    const id = index.get(key(name));
    if (id) return id;
  }
  for (const name of candidates) {
    for (const [existing, id] of index) if (existing.includes(key(name))) return id;
  }
  return null;
}

export interface CommunitySetupOptions {
  /** Twitch login to announce when it goes live. */
  twitch?: string | null;
  /** Channel for the go-live alert (otherwise found by name). */
  liveChannelId?: string | null;
  /** Role to ping on go-live. */
  liveRoleId?: string | null;
}

export interface CommunitySetupResult {
  modules: Module[];
  linked: string[];
  missing: string[];
  twitch: 'added' | 'exists' | 'no-channel' | 'no-credentials' | null;
}

export async function runCommunitySetup(
  guild: Guild,
  actorId: string,
  options: CommunitySetupOptions,
  ctx: Pick<BotContext, 'prisma' | 'redis' | 'logger' | 'jobs'>,
): Promise<CommunitySetupResult> {
  const channels = new Map<string, string>();
  const categories = new Map<string, string>();
  const roles = new Map<string, string>();
  for (const channel of (await guild.channels.fetch()).values()) {
    if (!channel) continue;
    if (channel.type === ChannelType.GuildCategory) categories.set(key(channel.name), channel.id);
    else if (channel.isTextBased()) channels.set(key(channel.name), channel.id);
  }
  for (const role of (await guild.roles.fetch()).values()) {
    if (!role.managed && role.id !== guild.id) roles.set(key(role.name), role.id);
  }

  const linked: string[] = [];
  const missing: string[] = [];
  const find = (label: string, index: Map<string, string>, candidates: string[], mark = '#') => {
    const id = pick(index, candidates);
    if (id) linked.push(`${label}: <${mark}${id}>`);
    else missing.push(label);
    return id;
  };

  const welcome = find('Welcome', channels, ['welcome', 'arrivals', 'new-members', 'hello']);
  // Specific names first: a bare "logs" would also match e.g. #verify-logs.
  const logs = find('Logs', channels, [
    'admin-logs',
    'mod-logs',
    'server-logs',
    'audit-log',
    'bot-logs',
    'mod-log',
    'logs',
  ]);
  const levels = find('Level-ups', channels, [
    'levels',
    'level-up',
    'bot-commands',
    'commands-only',
    'commands',
  ]);
  const transcripts = find('Ticket transcripts', channels, ['ticket-transcripts', 'transcripts']);
  const live = options.liveChannelId
    ? options.liveChannelId
    : find('Go-live alerts', channels, [
        'live',
        'going-live',
        'now-live',
        'stream-alerts',
        'streams',
        'twitch',
        'announcements',
      ]);
  const starboard = find('Starboard', channels, ['starboard', 'best-of', 'hall-of-fame']);
  const suggestions = find('Suggestions', channels, ['suggestions', 'ideas', 'feedback']);
  const birthdays = find('Birthdays', channels, ['birthdays', 'birthday']);
  const ticketPanel = find('Ticket panel', channels, ['tickets', 'support', 'help']);
  const ticketCategory = find('Ticket category', categories, ['tickets', 'support'], '#');
  const modRole = find('Moderator role', roles, ['moderator', 'mod', 'mods', 'staff'], '@&');
  const adminRole = find('Admin role', roles, ['admin', 'admins', 'owner'], '@&');

  const set = (...values: (string | null)[]) => values.filter((v): v is string => Boolean(v));
  const updates: Partial<Record<ModuleWithSchema, Record<string, unknown>>> = {
    MODERATION: {
      ...(modRole ? { modRoleIds: [modRole] } : {}),
      ...(adminRole ? { adminRoleIds: [adminRole] } : {}),
      ...(logs ? { modLogChannelId: logs } : {}),
    },
    AUTOMOD: {},
  };
  if (welcome) updates.WELCOME = { channelId: welcome, embedEnabled: true, thumbnail: 'user' };
  if (logs) {
    updates.LOGGING = {
      memberChannelId: logs,
      messageChannelId: logs,
      serverChannelId: logs,
      voiceChannelId: logs,
    };
  }
  updates.LEVELING = levels ? { announce: 'CHANNEL', announceChannelId: levels } : {};
  if (starboard) updates.STARBOARD = { channelId: starboard };
  if (suggestions) updates.SUGGESTIONS = { channelId: suggestions };
  if (birthdays) updates.BIRTHDAYS = { channelId: birthdays };
  if (ticketPanel && ticketCategory) {
    updates.TICKETS = {
      panelChannelId: ticketPanel,
      categoryId: ticketCategory,
      ...(transcripts ? { transcriptChannelId: transcripts } : {}),
      supportRoleIds: set(modRole, adminRole),
    };
  }

  const result: CommunitySetupResult = { modules: [], linked, missing, twitch: null };
  const enable = async (module: Module, config?: Prisma.InputJsonValue) => {
    await ctx.prisma.guildModuleConfig.upsert({
      where: { guildId_module: { guildId: guild.id, module } },
      update: { enabled: true, ...(config ? { config } : {}), updatedBy: actorId },
      create: {
        guildId: guild.id,
        module,
        enabled: true,
        config: config ?? {},
        updatedBy: actorId,
      },
    });
    await ctx.redis.publish(
      REDIS_CHANNELS.configUpdate,
      JSON.stringify({ guildId: guild.id, module }),
    );
    result.modules.push(module);
  };

  for (const [module, patch] of Object.entries(updates) as [
    ModuleWithSchema,
    Record<string, unknown>,
  ][]) {
    const existing = await ctx.prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: guild.id, module } },
    });
    const current = (existing?.config ?? {}) as Record<string, unknown>;
    // Validate the merged result so a bad patch can never land in the DB.
    await enable(
      module,
      parseModuleConfig(module, { ...current, ...patch }) as Prisma.InputJsonValue,
    );
  }
  // Modules with no channel of their own that a stream community wants on.
  for (const module of ['ROLES', 'GIVEAWAYS', 'POLLS', 'UTILITY', 'SOCIAL'] as const) {
    await enable(module);
  }

  const login = options.twitch?.trim().toLowerCase().replace(/^@/, '') || null;
  if (login) {
    if (!live) result.twitch = 'no-channel';
    else if (!platformAvailable('twitch', env)) result.twitch = 'no-credentials';
    else {
      const existing = await ctx.prisma.socialSubscription.findFirst({
        where: { guildId: guild.id, platform: 'twitch', target: login },
      });
      if (existing) result.twitch = 'exists';
      else {
        const created = await ctx.prisma.socialSubscription.create({
          data: {
            guildId: guild.id,
            platform: 'twitch',
            target: login,
            channelId: live,
            mentionRoleId: options.liveRoleId ?? null,
          },
        });
        // Baseline to "now" so a stream already in progress isn't re-announced.
        await baselineSubscription(created.id).catch(() => undefined);
        await scheduleSocialPoll(ctx.jobs, created.id);
        result.twitch = 'added';
      }
    }
  }

  ctx.logger.info({ guildId: guild.id, actorId, ...result }, 'Community setup applied');
  return result;
}
