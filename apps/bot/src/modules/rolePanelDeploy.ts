import { DiscordAPIError, PermissionFlagsBits, type Client, type Guild } from 'discord.js';
import { prisma } from '@refx/database';
import type { LiveCommandResult, RolePanelOption } from '@refx/shared';
import type { Logger } from '../logger';
import { buildPanelMessage } from './roles';

/**
 * Post (or re-post) a role panel and say how it went. Every failure comes back
 * as a sentence an admin can act on, because the dashboard shows it verbatim
 * next to the form they are still editing.
 */

const NEEDED = [
  [PermissionFlagsBits.ViewChannel, 'View Channel'],
  [PermissionFlagsBits.SendMessages, 'Send Messages'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
] as const;

const fail = (error: string): LiveCommandResult => ({ ok: false, error });

/** Which option a Discord "Invalid Form Body" path points at, if any. */
function optionFromErrorPath(path: string, options: RolePanelOption[]): RolePanelOption | null {
  // Buttons: components[row].components[col]; select: components[0].components[0].options[i].
  const select = path.match(/options\[(\d+)\]/);
  if (select) return options[Number(select[1])] ?? null;
  const button = path.match(/components\[(\d+)\]\.components\[(\d+)\]/);
  if (button) return options[Number(button[1]) * 5 + Number(button[2])] ?? null;
  return null;
}

/** Flatten discord.js's nested `rawError.errors` into "path: message" pairs. */
function flattenApiErrors(node: unknown, path = ''): { path: string; message: string }[] {
  if (!node || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  const own = Array.isArray(record._errors)
    ? (record._errors as { message?: string }[]).map((e) => ({ path, message: e.message ?? '' }))
    : [];
  const nested = Object.entries(record)
    .filter(([key]) => key !== '_errors')
    .flatMap(([key, value]) =>
      flattenApiErrors(
        value,
        /^\d+$/.test(key) ? `${path}[${key}]` : path ? `${path}.${key}` : key,
      ),
    );
  return [...own, ...nested];
}

export function explainPanelError(err: unknown, options: RolePanelOption[], channelName: string) {
  if (!(err instanceof DiscordAPIError)) {
    return `Something went wrong while posting: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (err.code === 50013 || err.code === 50001) {
    return `Discord refused the post in #${channelName}: I'm missing permissions there. I need View Channel, Send Messages and Embed Links.`;
  }
  if (err.code === 50035) {
    const details = flattenApiErrors((err.rawError as { errors?: unknown }).errors);
    const emoji = details.find((d) => d.path.includes('emoji'));
    if (emoji) {
      const option = optionFromErrorPath(emoji.path, options);
      return (
        `Discord rejected the emoji${option ? ` on "${option.label}" (${option.emoji ?? ''})` : ''}. ` +
        'Use a single standard emoji, or a custom emoji from this server written as <:name:id>.'
      );
    }
    const first = details[0];
    if (first) {
      const option = optionFromErrorPath(first.path, options);
      return `Discord rejected the panel${option ? ` at "${option.label}"` : ''}: ${first.message}`;
    }
  }
  return `Discord rejected the panel: ${err.message} (code ${err.code}).`;
}

/** Roles on the panel the bot could not hand out if a member clicked them. */
function unassignableRoles(guild: Guild, options: RolePanelOption[]): string[] {
  const me = guild.members.me;
  if (!me) return [];
  const warnings: string[] = [];
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    warnings.push('I don’t have Manage Roles in this server, so the buttons can’t give roles yet.');
    return warnings;
  }
  const deleted: string[] = [];
  const tooHigh: string[] = [];
  const managed: string[] = [];
  for (const option of options) {
    const role = guild.roles.cache.get(option.roleId);
    if (!role) deleted.push(option.label);
    else if (role.managed) managed.push(role.name);
    else if (role.position >= me.roles.highest.position) tooHigh.push(role.name);
  }
  if (tooHigh.length) {
    warnings.push(
      `I can’t give ${tooHigh.map((n) => `@${n}`).join(', ')} yet: move my role above ${tooHigh.length === 1 ? 'it' : 'them'} in Server Settings → Roles.`,
    );
  }
  if (managed.length) {
    warnings.push(
      `${managed.map((n) => `@${n}`).join(', ')} ${managed.length === 1 ? 'is' : 'are'} managed by an integration and can’t be given by a bot.`,
    );
  }
  if (deleted.length) {
    warnings.push(`The role for ${deleted.map((n) => `"${n}"`).join(', ')} no longer exists.`);
  }
  return warnings;
}

export async function deployRolePanel(
  client: Client,
  logger: Logger,
  guildId: string,
  panelId: string,
): Promise<LiveCommandResult> {
  const panel = await prisma.reactionRolePanel.findUnique({ where: { id: panelId } });
  if (!panel || panel.guildId !== guildId) return fail('That panel no longer exists.');
  if (!panel.channelId) return fail('Pick a channel for the panel first.');

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return fail('I’m not in that server any more.');
  const channel =
    guild.channels.cache.get(panel.channelId) ??
    (await guild.channels.fetch(panel.channelId).catch(() => null));
  if (!channel) {
    return fail('I can’t find that channel. It may have been deleted, or I can’t see it.');
  }
  if (!channel.isTextBased() || channel.isDMBased()) {
    return fail(`#${channel.name} can’t hold messages. Pick a text channel.`);
  }

  const me = guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  const missing = NEEDED.filter(([flag]) => !permissions?.has(flag)).map(([, name]) => name);
  if (missing.length) {
    return fail(
      `I’m missing ${missing.join(', ')} in #${channel.name}. Give my role ${missing.length === 1 ? 'that permission' : 'those permissions'} there and try again.`,
    );
  }

  const options = panel.options as RolePanelOption[];
  const body = buildPanelMessage({
    id: panel.id,
    title: panel.title,
    description: panel.description,
    mode: panel.mode,
    type: panel.type,
    options,
  });

  try {
    const existing = panel.messageId
      ? await channel.messages.fetch(panel.messageId).catch(() => null)
      : null;
    if (existing) {
      await existing.edit(body);
    } else {
      const sent = await channel.send(body);
      await prisma.reactionRolePanel.update({
        where: { id: panel.id },
        data: { messageId: sent.id },
      });
    }
  } catch (err) {
    logger.warn({ err, panelId: panel.id }, 'Deploy panel failed');
    return fail(explainPanelError(err, options, channel.name));
  }

  const warnings = unassignableRoles(guild, options);
  return warnings.length ? { ok: true, warnings } : { ok: true };
}
