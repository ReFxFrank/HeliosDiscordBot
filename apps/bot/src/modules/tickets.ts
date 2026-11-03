import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type BaseMessageOptions,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type OverwriteResolvable,
} from 'discord.js';
import { prisma } from '@refx/database';
import { QUEUE_NAMES } from '@refx/jobs';
import { parseModuleConfig, REDIS_CHANNELS, type TicketsConfig } from '@refx/shared';
import { redis } from '../services/redis';
import { brandedEmbed } from '../lib/embeds';
import { buildCustomId } from '../framework/customId';
import { ticketJobId, type JobService } from '../services/jobs';
import type { Logger } from '../logger';

export interface TicketDeps {
  client: Client;
  jobs: JobService;
  logger: Logger;
}

const HOUR_MS = 3_600_000;
const TOUCH_THROTTLE_MS = 60_000;

/**
 * Per-shard set of channel ids that are open tickets, so the message listener
 * can decide whether to bump activity with an O(1) lookup instead of a query
 * per message. Populated by `reconcileTickets` on boot and kept in sync by
 * open/close.
 */
const openTicketChannels = new Set<string>();
const lastTouchAt = new Map<string, number>();

export function isTicketChannel(channelId: string): boolean {
  return openTicketChannels.has(channelId);
}

export async function getTicketsConfig(guildId: string): Promise<TicketsConfig> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TICKETS' } },
    select: { config: true },
  });
  return parseModuleConfig('TICKETS', row?.config ?? {});
}

export function buildTicketPanelMessage(config: TicketsConfig): BaseMessageOptions {
  const embed = brandedEmbed({ title: config.panelTitle, description: config.panelDescription });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('ticket', 'open'))
      .setLabel(config.buttonLabel)
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

function resolveTextChannel(guild: Guild, channelId: string): GuildTextBasedChannel | null {
  const channel = guild.channels.cache.get(channelId);
  return channel && channel.isTextBased() && !channel.isDMBased() ? channel : null;
}

/**
 * Zero-config bootstrap, run when the module is switched on with no category
 * configured (SETUP_TICKETS live command from the dashboard toggle). Builds a
 * working setup from what the guild already has:
 *
 *   - support roles: roles named like support/staff/mod/helper/admin, falling
 *     back to the top moderation-capable roles
 *   - a hidden "Tickets" category (reused if one already exists)
 *   - #ticket-transcripts under it (staff-only via the category)
 *   - a public read-only #open-a-ticket with the panel already deployed
 *
 * Idempotent: bails if a category is already configured and still exists, and
 * reuses same-named channels instead of duplicating them. Skips quietly (with
 * a log) when the bot lacks Manage Channels.
 */
export async function autoSetupTickets(guildId: string, deps: TicketDeps): Promise<void> {
  const guild = deps.client.guilds.cache.get(guildId);
  if (!guild) return;

  const config = await getTicketsConfig(guildId);
  if (config.categoryId && guild.channels.cache.has(config.categoryId)) return;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    deps.logger.warn({ guildId }, 'Tickets auto-setup skipped: bot lacks Manage Channels');
    return;
  }

  // Support roles — prefer obviously-named ones, highest first.
  const assignable = guild.roles.cache.filter(
    (role) => !role.managed && role.id !== guild.roles.everyone.id,
  );
  let supportRoles = [
    ...assignable.filter((role) => /support|staff|mod|helper|admin/i.test(role.name)).values(),
  ];
  if (supportRoles.length === 0) {
    supportRoles = [
      ...assignable
        .filter(
          (role) =>
            role.permissions.has(PermissionFlagsBits.ManageMessages) ||
            role.permissions.has(PermissionFlagsBits.ModerateMembers),
        )
        .values(),
    ];
  }
  const supportRoleIds = supportRoles
    .sort((a, b) => b.position - a.position)
    .slice(0, 5)
    .map((role) => role.id);

  const staffOverwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...supportRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
    ...(deps.client.user
      ? [
          {
            id: deps.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ]
      : []),
  ];

  // Category (reuse a "…tickets…" category if the server already has one).
  const category =
    guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildCategory && /ticket/i.test(channel.name),
    ) ??
    (await guild.channels.create({
      name: 'Tickets',
      type: ChannelType.GuildCategory,
      permissionOverwrites: staffOverwrites,
    }));

  // Transcript archive — hidden with the category's staff-only permissions.
  const transcripts =
    guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildText && channel.name === 'ticket-transcripts',
    ) ??
    (await guild.channels.create({
      name: 'ticket-transcripts',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: staffOverwrites,
    }));

  // Public panel channel: everyone can read, only the panel button interacts.
  const panelChannel =
    guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildText && channel.name === 'open-a-ticket',
    ) ??
    (await guild.channels.create({
      name: 'open-a-ticket',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages],
        },
        ...(deps.client.user
          ? [
              {
                id: deps.client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
              },
            ]
          : []),
      ],
    }));

  const nextConfig: TicketsConfig = {
    ...config,
    categoryId: category.id,
    supportRoleIds,
    transcriptChannelId: transcripts.id,
    panelChannelId: panelChannel.id,
  };

  const panelTarget = resolveTextChannel(guild, panelChannel.id);
  if (panelTarget) await panelTarget.send(buildTicketPanelMessage(nextConfig));

  await prisma.guildModuleConfig.upsert({
    where: { guildId_module: { guildId, module: 'TICKETS' } },
    update: { config: nextConfig },
    create: { guildId, module: 'TICKETS', enabled: true, config: nextConfig },
  });
  // Invalidate the bot-side config cache the same way a dashboard save does.
  await redis.publish(REDIS_CHANNELS.configUpdate, JSON.stringify({ guildId, module: 'TICKETS' }));

  deps.logger.info(
    { guildId, category: category.id, panel: panelChannel.id, supportRoles: supportRoleIds.length },
    'Tickets auto-configured',
  );
}

/**
 * Create a private ticket channel for `openerId`. Returns the new channel id or
 * a user-facing error reason. Does not check the module-enabled flag — the
 * caller does (the component path checks the config cache).
 */
export async function openTicket(
  guild: Guild,
  openerId: string,
  deps: TicketDeps,
): Promise<{ channelId: string } | { error: string }> {
  const config = await getTicketsConfig(guild.id);
  if (!config.categoryId) return { error: 'Tickets are not configured on this server yet.' };

  const category = guild.channels.cache.get(config.categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { error: 'The configured ticket category no longer exists.' };
  }

  const openCount = await prisma.ticket.count({
    where: { guildId: guild.id, openerId, status: 'OPEN' },
  });
  if (openCount >= config.maxOpenPerUser) {
    return {
      error: `You already have ${config.maxOpenPerUser} open ticket${config.maxOpenPerUser > 1 ? 's' : ''}.`,
    };
  }

  // Allocate a per-guild ticket number atomically (collision-safe).
  await prisma.guild.upsert({ where: { id: guild.id }, update: {}, create: { id: guild.id } });
  const { ticketCounter: number } = await prisma.guild.update({
    where: { id: guild.id },
    data: { ticketCounter: { increment: 1 } },
    select: { ticketCounter: true },
  });

  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: openerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    ...config.supportRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];
  if (deps.client.user) {
    overwrites.push({
      id: deps.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const channel = await guild.channels
    .create({
      name: `ticket-${String(number).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: config.categoryId,
      topic: `Ticket #${number} • opened by ${openerId}`,
      permissionOverwrites: overwrites,
    })
    .catch((err: unknown) => {
      deps.logger.warn({ err, guildId: guild.id }, 'Ticket channel create failed');
      return null;
    });
  if (!channel) return { error: "I couldn't create the ticket channel — check my permissions." };

  const ticket = await prisma.ticket.create({
    data: { guildId: guild.id, channelId: channel.id, number, openerId },
  });
  openTicketChannels.add(channel.id);

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('ticket', 'close'))
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
  const mentions = [`<@${openerId}>`, ...config.supportRoleIds.map((id) => `<@&${id}>`)].join(' ');
  await channel
    .send({
      content: mentions,
      embeds: [brandedEmbed({ title: `Ticket #${number}`, description: config.openMessage })],
      components: [closeRow],
      allowedMentions: { users: [openerId], roles: config.supportRoleIds },
    })
    .catch(() => undefined);

  if (config.autoCloseHours > 0) {
    await deps.jobs.schedule(
      QUEUE_NAMES.ticketAutoClose,
      'ticketAutoClose',
      { ticketId: ticket.id },
      { delayMs: config.autoCloseHours * HOUR_MS, jobId: ticketJobId(ticket.id) },
    );
  }

  return { channelId: channel.id };
}

async function buildTranscript(channel: GuildTextBasedChannel): Promise<string> {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages || messages.size === 0) return 'No messages.';
  return [...messages.values()]
    .reverse()
    .map((message) => {
      const when = new Date(message.createdTimestamp).toISOString();
      const body =
        message.cleanContent ||
        (message.attachments.size ? '[attachment]' : '') ||
        (message.embeds.length ? '[embed]' : '');
      return `[${when}] ${message.author.tag}: ${body}`;
    })
    .join('\n');
}

/**
 * Close a ticket: mark it closed, archive a transcript (if configured), cancel
 * its auto-close job, and delete the channel. Idempotent — a non-open ticket is
 * a no-op. Returns whether it acted.
 */
export async function closeTicket(
  channelId: string,
  closedById: string,
  deps: TicketDeps,
  reason = 'closed',
): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({ where: { channelId } });
  if (!ticket || ticket.status !== 'OPEN') return false;

  // Atomic claim: only the first closer (e.g. manual click vs. auto-close
  // firing at the same instant) proceeds to transcript + delete, so we never
  // archive twice.
  const claimed = await prisma.ticket.updateMany({
    where: { id: ticket.id, status: 'OPEN' },
    data: { status: 'CLOSED', closedById, closedAt: new Date() },
  });
  if (claimed.count === 0) return false;
  openTicketChannels.delete(channelId);
  lastTouchAt.delete(channelId);
  await deps.jobs.cancel(QUEUE_NAMES.ticketAutoClose, ticketJobId(ticket.id));

  const guild = deps.client.guilds.cache.get(ticket.guildId);
  const channel = guild ? resolveTextChannel(guild, channelId) : null;
  const config = await getTicketsConfig(ticket.guildId);

  if (channel && config.transcriptChannelId) {
    const transcript = await buildTranscript(channel);
    const transcriptChannel = guild ? resolveTextChannel(guild, config.transcriptChannelId) : null;
    if (transcriptChannel) {
      const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
        name: `transcript-ticket-${ticket.number}.txt`,
      });
      await transcriptChannel
        .send({
          embeds: [
            brandedEmbed({
              title: `Ticket #${ticket.number} closed`,
              description: `Opened by <@${ticket.openerId}> • closed by <@${closedById}> • ${reason}`,
            }),
          ],
          files: [file],
          allowedMentions: { parse: [] },
        })
        .catch(() => undefined);
    }
  }

  if (channel) {
    await channel.delete(`Ticket #${ticket.number} ${reason}`).catch(() => undefined);
  }
  return true;
}

/** Bump a ticket's activity clock and push back its auto-close (throttled). */
export async function touchTicket(channelId: string, deps: TicketDeps): Promise<void> {
  const now = Date.now();
  if (now - (lastTouchAt.get(channelId) ?? 0) < TOUCH_THROTTLE_MS) return;
  lastTouchAt.set(channelId, now);

  const ticket = await prisma.ticket.findUnique({
    where: { channelId },
    select: { id: true, guildId: true, status: true },
  });
  if (!ticket || ticket.status !== 'OPEN') {
    openTicketChannels.delete(channelId);
    return;
  }
  await prisma.ticket.update({ where: { id: ticket.id }, data: { lastActivityAt: new Date() } });

  const config = await getTicketsConfig(ticket.guildId);
  if (config.autoCloseHours > 0) {
    await deps.jobs.schedule(
      QUEUE_NAMES.ticketAutoClose,
      'ticketAutoClose',
      { ticketId: ticket.id },
      { delayMs: config.autoCloseHours * HOUR_MS, jobId: ticketJobId(ticket.id) },
    );
  }
}

/**
 * A channel was deleted out-of-band (manually, not via close). Mark its ticket
 * closed and drop its timers so reconcile/auto-close don't chase a dead channel.
 */
export async function onTicketChannelDeleted(
  channelId: string,
  deps: Pick<TicketDeps, 'jobs'>,
): Promise<void> {
  openTicketChannels.delete(channelId);
  lastTouchAt.delete(channelId);
  const ticket = await prisma.ticket.findUnique({
    where: { channelId },
    select: { id: true, status: true },
  });
  if (!ticket || ticket.status !== 'OPEN') return;
  await prisma.ticket.updateMany({
    where: { id: ticket.id, status: 'OPEN' },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
  await deps.jobs.cancel(QUEUE_NAMES.ticketAutoClose, ticketJobId(ticket.id));
}

/** Load open tickets for this shard's guilds into the activity set + re-arm jobs. */
export async function reconcileTickets(
  client: Client,
  jobs: JobService,
  logger: Logger,
): Promise<void> {
  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length === 0) return;
  const tickets = await prisma.ticket.findMany({
    where: { status: 'OPEN', guildId: { in: guildIds } },
    select: { id: true, guildId: true, channelId: true, lastActivityAt: true },
  });
  openTicketChannels.clear();
  for (const ticket of tickets) {
    openTicketChannels.add(ticket.channelId);
    const config = await getTicketsConfig(ticket.guildId);
    if (config.autoCloseHours > 0) {
      const fireAt = ticket.lastActivityAt.getTime() + config.autoCloseHours * HOUR_MS;
      await jobs.schedule(
        QUEUE_NAMES.ticketAutoClose,
        'ticketAutoClose',
        { ticketId: ticket.id },
        { delayMs: fireAt - Date.now(), jobId: ticketJobId(ticket.id) },
      );
    }
  }
  logger.info({ count: tickets.length }, 'Reconciled tickets');
}
