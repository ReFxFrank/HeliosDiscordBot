import { ChannelType, PermissionFlagsBits, type Guild } from 'discord.js';
import {
  getServerTemplate,
  REDIS_CHANNELS,
  templateChannelCount,
  type Module,
  type ServerTemplate,
  type TemplatePermission,
} from '@refx/shared';
import { prisma } from '@refx/database';
import type { Logger } from '../logger';
import { redis } from '../services/redis';
import { brandedEmbed } from '../lib/embeds';

/** Discord's hard cap on channels per guild (categories included). */
const MAX_GUILD_CHANNELS = 500;

const PERMISSION_MAP: Record<TemplatePermission, bigint> = {
  ManageMessages: PermissionFlagsBits.ManageMessages,
  ModerateMembers: PermissionFlagsBits.ModerateMembers,
  KickMembers: PermissionFlagsBits.KickMembers,
  BanMembers: PermissionFlagsBits.BanMembers,
  ManageChannels: PermissionFlagsBits.ManageChannels,
  ManageRoles: PermissionFlagsBits.ManageRoles,
  ManageGuild: PermissionFlagsBits.ManageGuild,
  MentionEveryone: PermissionFlagsBits.MentionEveryone,
};

export interface TemplateApplyResult {
  templateName: string;
  templateEmoji: string;
  createdRoles: string[];
  skippedRoles: string[];
  createdCategories: string[];
  createdChannels: number;
  skippedChannels: number;
  enabledModules: Module[];
  hitChannelLimit: boolean;
}

type ApplyOutcome = { ok: true; result: TemplateApplyResult } | { ok: false; error: string };

const norm = (name: string): string => name.trim().toLowerCase();

/**
 * Apply a server template additively: create any missing roles, then the
 * categories/channels, then enable the template's modules (owner-disabled ones
 * never). Nothing is ever deleted — an
 * existing role/channel with the same name is left untouched — so re-running is
 * safe. Posts a summary embed and returns a machine-readable result.
 */
export async function applyServerTemplate(
  guild: Guild,
  templateId: string,
  actorId: string,
  deps: { logger: Logger },
): Promise<ApplyOutcome> {
  const template = getServerTemplate(templateId);
  if (!template) return { ok: false, error: `Unknown template "${templateId}".` };

  const me = guild.members.me;
  if (!me) return { ok: false, error: 'Bot member not found in guild.' };
  const missing: string[] = [];
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) missing.push('Manage Channels');
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) missing.push('Manage Roles');
  if (missing.length > 0) {
    return { ok: false, error: `I'm missing the ${missing.join(' and ')} permission.` };
  }

  const reason = `Server template: ${template.name} (by ${actorId})`;
  const result: TemplateApplyResult = {
    templateName: template.name,
    templateEmoji: template.emoji,
    createdRoles: [],
    skippedRoles: [],
    createdCategories: [],
    createdChannels: 0,
    skippedChannels: 0,
    enabledModules: [],
    hitChannelLimit: false,
  };

  await createRoles(guild, template, reason, result, deps.logger);
  await createChannels(guild, template, reason, result, deps.logger);
  await enableModules(guild, template, actorId, result, deps.logger);

  await postSummary(guild, result).catch((err: unknown) =>
    deps.logger.warn({ err, guildId: guild.id }, 'Template summary post failed'),
  );

  deps.logger.info(
    { guildId: guild.id, template: template.id, ...summarize(result) },
    'Applied server template',
  );
  return { ok: true, result };
}

async function createRoles(
  guild: Guild,
  template: ServerTemplate,
  reason: string,
  result: TemplateApplyResult,
  logger: Logger,
): Promise<void> {
  for (const spec of template.roles) {
    const exists = guild.roles.cache.some((role) => norm(role.name) === norm(spec.name));
    if (exists) {
      result.skippedRoles.push(spec.name);
      continue;
    }
    try {
      await guild.roles.create({
        name: spec.name,
        color: spec.color,
        hoist: spec.hoist ?? false,
        permissions: (spec.permissions ?? []).map((key) => PERMISSION_MAP[key]),
        reason,
      });
      result.createdRoles.push(spec.name);
    } catch (err) {
      logger.warn({ err, guildId: guild.id, role: spec.name }, 'Template role create failed');
      result.skippedRoles.push(spec.name);
    }
  }
}

async function createChannels(
  guild: Guild,
  template: ServerTemplate,
  reason: string,
  result: TemplateApplyResult,
  logger: Logger,
): Promise<void> {
  // Refuse to blow past Discord's cap; leave headroom for whatever exists.
  if (guild.channels.cache.size + templateChannelCount(template) > MAX_GUILD_CHANNELS) {
    result.hitChannelLimit = true;
  }

  for (const cat of template.categories) {
    if (guild.channels.cache.size >= MAX_GUILD_CHANNELS) {
      result.hitChannelLimit = true;
      return;
    }
    let category = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory && norm(channel.name) === norm(cat.name),
    );
    if (!category) {
      try {
        category = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          reason,
        });
        result.createdCategories.push(cat.name);
        result.createdChannels += 1;
      } catch (err) {
        logger.warn(
          { err, guildId: guild.id, category: cat.name },
          'Template category create failed',
        );
        continue;
      }
    }

    const parentId = category.id;
    for (const spec of cat.channels) {
      if (guild.channels.cache.size >= MAX_GUILD_CHANNELS) {
        result.hitChannelLimit = true;
        return;
      }
      const wantType = spec.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const already = guild.channels.cache.some(
        (channel) =>
          channel.parentId === parentId &&
          channel.type === wantType &&
          norm(channel.name) === norm(spec.name),
      );
      if (already) {
        result.skippedChannels += 1;
        continue;
      }
      try {
        await guild.channels.create({
          name: spec.name,
          type: wantType,
          parent: parentId,
          ...(spec.type === 'text' && spec.topic ? { topic: spec.topic } : {}),
          reason,
        });
        result.createdChannels += 1;
      } catch (err) {
        logger.warn(
          { err, guildId: guild.id, channel: spec.name },
          'Template channel create failed',
        );
        result.skippedChannels += 1;
      }
    }
  }
}

async function enableModules(
  guild: Guild,
  template: ServerTemplate,
  actorId: string,
  result: TemplateApplyResult,
  logger: Logger,
): Promise<void> {
  const offFlags = await prisma.globalModuleFlag.findMany({
    where: { enabled: false },
    select: { module: true },
  });
  const globallyOff = new Set(offFlags.map((flag) => flag.module));

  for (const module of template.modules) {
    if (globallyOff.has(module)) continue; // owner turned it off globally
    try {
      await prisma.guildModuleConfig.upsert({
        where: { guildId_module: { guildId: guild.id, module } },
        update: { enabled: true, updatedBy: actorId },
        create: { guildId: guild.id, module, enabled: true, updatedBy: actorId },
      });
      // Invalidate every shard's + the dashboard's config cache for this module.
      await redis.publish(
        REDIS_CHANNELS.configUpdate,
        JSON.stringify({ guildId: guild.id, module }),
      );
      result.enabledModules.push(module);
    } catch (err) {
      logger.warn({ err, guildId: guild.id, module }, 'Template module enable failed');
    }
  }
}

/** Post a summary to the first created text channel, else the system channel. */
async function postSummary(guild: Guild, result: TemplateApplyResult): Promise<void> {
  const target =
    guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildText && channel.name === 'general',
    ) ?? guild.systemChannel;
  if (!target || !target.isTextBased() || target.isDMBased() || !('send' in target)) return;

  const lines = [
    `**${result.createdChannels}** channel(s) created` +
      (result.skippedChannels ? ` · ${result.skippedChannels} already existed` : ''),
    `**${result.createdRoles.length}** role(s) created` +
      (result.skippedRoles.length ? ` · ${result.skippedRoles.length} already existed` : ''),
  ];
  if (result.enabledModules.length) {
    lines.push(`Modules enabled: ${result.enabledModules.join(', ')}`);
  }
  if (result.hitChannelLimit) {
    lines.push(
      `⚠️ Stopped early — this server is near Discord's ${MAX_GUILD_CHANNELS}-channel limit.`,
    );
  }

  await target.send({
    embeds: [
      brandedEmbed({
        kind: 'success',
        title: `${result.templateEmoji} ${result.templateName} template applied`,
        description: lines.join('\n'),
      }),
    ],
  });
}

function summarize(result: TemplateApplyResult): Record<string, number> {
  return {
    channels: result.createdChannels,
    roles: result.createdRoles.length,
    modules: result.enabledModules.length,
  };
}
