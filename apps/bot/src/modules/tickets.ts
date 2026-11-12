import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  OverwriteType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type BaseMessageOptions,
  type Client,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type OverwriteResolvable,
  type TextChannel,
} from 'discord.js';
import { prisma, type Prisma, type Ticket } from '@refx/database';
import { QUEUE_NAMES } from '@refx/jobs';
import {
  findTicketType,
  listTicketTypes,
  parseModuleConfig,
  REDIS_CHANNELS,
  renderTicketChannelName,
  TICKET_BLOCKED_MAX,
  ticketStaffRoleIds,
  type LiveCommandResult,
  type ResolvedTicketType,
  type TicketsConfig,
} from '@refx/shared';
import { redis } from '../services/redis';
import { brandedEmbed } from '../lib/embeds';
import {
  renderTranscriptHtml,
  type TranscriptAttachment,
  type TranscriptMessage,
} from '../lib/ticketTranscript';
import { buildCustomId } from '../framework/customId';
import { ticketJobId, type JobService } from '../services/jobs';
import { explainPanelError } from './rolePanelDeploy';
import type { Logger } from '../logger';

export interface TicketDeps {
  client: Client;
  jobs: JobService;
  logger: Logger;
}

/** One answer from the opening form. */
export interface TicketAnswer {
  question: string;
  answer: string;
}

const HOUR_MS = 3_600_000;
const TOUCH_THROTTLE_MS = 60_000;
const CLOSE_REQUEST_THROTTLE_MS = 5 * 60_000;
/** Longest answer the opening form accepts; five of them still fit one embed. */
const LONG_ANSWER_MAX = 800;
const SHORT_ANSWER_MAX = 200;
/** A transcript holds at most this many messages (the most recent ones). */
const TRANSCRIPT_MAX_MESSAGES = 2000;
/** Images are copied into the transcript so they outlive the channel, within these limits. */
const IMAGE_MAX_BYTES = 1_500_000;
const IMAGE_BUDGET_BYTES = 5_000_000;
const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const STAFF_CHANNEL_PERMISSIONS = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  ManageMessages: true,
} as const;

/**
 * Per-shard set of channel ids that are open tickets, so the message listener
 * can decide whether to bump activity with an O(1) lookup instead of a query
 * per message. Populated by `reconcileTickets` on boot and kept in sync by
 * open/close/reopen.
 */
const openTicketChannels = new Set<string>();
const lastTouchAt = new Map<string, number>();
const lastCloseRequestAt = new Map<string, number>();

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

async function saveTicketsConfig(guildId: string, config: TicketsConfig): Promise<void> {
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
  await prisma.guildModuleConfig.upsert({
    where: { guildId_module: { guildId, module: 'TICKETS' } },
    update: { config },
    create: { guildId, module: 'TICKETS', enabled: true, config },
  });
  // Invalidate the bot-side config cache the same way a dashboard save does.
  await redis.publish(REDIS_CHANNELS.configUpdate, JSON.stringify({ guildId, module: 'TICKETS' }));
}

/** Staff for a ticket: Manage Server, or one of the support roles for its type. */
export function isTicketStaff(
  member: GuildMember,
  config: TicketsConfig,
  typeId: string | null | undefined,
): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    ticketStaffRoleIds(config, typeId).some((id) => member.roles.cache.has(id))
  );
}

/** Set an emoji if Discord's builder accepts it; an invalid one is simply left off. */
function safeEmoji(builder: { setEmoji(emoji: string): unknown }, emoji: string): void {
  if (!emoji) return;
  try {
    builder.setEmoji(emoji);
  } catch {
    /* not a usable emoji string: render without one */
  }
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function buildTicketPanelMessage(config: TicketsConfig): BaseMessageOptions {
  const embed = brandedEmbed({ title: config.panelTitle, description: config.panelDescription });
  const types = listTicketTypes(config);

  if (config.panelStyle === 'DROPDOWN' && types.length > 1) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId('ticket', 'pick'))
      .setPlaceholder('Choose what you need help with')
      .addOptions(
        types.map((type) => {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(type.label.slice(0, 100))
            .setValue(type.id);
          if (type.description) option.setDescription(type.description);
          safeEmoji(option, type.emoji);
          return option;
        }),
      );
    return {
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    };
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  types.forEach((type, index) => {
    if (index % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
    const button = new ButtonBuilder()
      .setCustomId(buildCustomId('ticket', 'open', type.id))
      .setLabel(type.label)
      .setStyle(types.length === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary);
    safeEmoji(button, type.emoji);
    rows[rows.length - 1]?.addComponents(button);
  });
  return { embeds: [embed], components: rows };
}

function isTicketPanelMessage(message: Message): boolean {
  return message.components.some(
    (row) =>
      'components' in row &&
      row.components.some(
        (component) =>
          'customId' in component &&
          typeof component.customId === 'string' &&
          (component.customId.startsWith('ticket:open') ||
            component.customId.startsWith('ticket:pick')),
      ),
  );
}

const PANEL_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, 'View Channel'],
  [PermissionFlagsBits.SendMessages, 'Send Messages'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
  [PermissionFlagsBits.ReadMessageHistory, 'Read Message History'],
] as const;

/**
 * Post the "open a ticket" panel, or update the one already in the channel so
 * redeploying after a settings change never leaves a stale duplicate behind.
 * Failures come back as a sentence the dashboard can show as-is.
 */
export async function deployTicketPanel(
  guild: Guild,
  channelId: string,
  logger: Logger,
): Promise<LiveCommandResult> {
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    return { ok: false, error: 'The panel channel no longer exists. Pick another one and save.' };
  }
  const me = guild.members.me;
  if (me) {
    const granted = channel.permissionsFor(me);
    const missing = PANEL_PERMISSIONS.filter(([bit]) => !granted.has(bit)).map(([, name]) => name);
    if (missing.length > 0) {
      return {
        ok: false,
        error: `I can't post in #${channel.name}: I'm missing ${missing.join(', ')} there.`,
      };
    }
  }

  const config = await getTicketsConfig(guild.id);
  const payload = buildTicketPanelMessage(config);
  try {
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const existing = recent?.find(
      (message) => message.author.id === guild.client.user.id && isTicketPanelMessage(message),
    );
    if (existing) {
      await existing.edit(payload);
      return { ok: true, warnings: ['The panel already in the channel was updated in place.'] };
    }
    await channel.send(payload);
    return { ok: true };
  } catch (err) {
    logger.warn({ err, guildId: guild.id, channelId }, 'Deploy ticket panel failed');
    const options = listTicketTypes(config).map((type) => ({
      roleId: '',
      label: type.label,
      emoji: type.emoji,
    }));
    return { ok: false, error: explainPanelError(err, options, channel.name) };
  }
}

function resolveTextChannel(guild: Guild, channelId: string): GuildTextBasedChannel | null {
  const channel = guild.channels.cache.get(channelId);
  return channel && channel.isTextBased() && !channel.isDMBased() ? channel : null;
}

/** A ticket's own channel (always a plain text channel the bot created). */
function resolveTicketChannel(guild: Guild, channelId: string): TextChannel | null {
  const channel = guild.channels.cache.get(channelId);
  return channel?.type === ChannelType.GuildText ? channel : null;
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

  await saveTicketsConfig(guildId, nextConfig);

  deps.logger.info(
    { guildId, category: category.id, panel: panelChannel.id, supportRoles: supportRoleIds.length },
    'Tickets auto-configured',
  );
}

// ── Opening ──────────────────────────────────────────────────────────────────

export interface OpenCheck {
  config: TicketsConfig;
  type: ResolvedTicketType;
  categoryId: string;
}

/**
 * Everything that can stop a member opening a ticket, checked before any
 * channel is made (and before the form is shown, so nobody fills it in for
 * nothing). Returns a sentence for the member when the answer is no.
 */
export async function checkCanOpen(
  guild: Guild,
  userId: string,
  typeId: string | null | undefined,
): Promise<OpenCheck | { error: string }> {
  const config = await getTicketsConfig(guild.id);
  const type = findTicketType(config, typeId);
  if (!type) {
    return {
      error:
        'That kind of ticket is no longer offered. Ask staff to refresh the ticket panel, then try again.',
    };
  }
  if (config.blockedUserIds.includes(userId)) {
    return {
      error:
        "You can't open tickets on this server. If you think that is a mistake, contact a staff member directly.",
    };
  }
  if (!type.categoryId) return { error: 'Tickets are not configured on this server yet.' };
  const category = guild.channels.cache.get(type.categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { error: 'The ticket category no longer exists. Please let staff know.' };
  }

  const openCount = await prisma.ticket.count({
    where: { guildId: guild.id, openerId: userId, status: 'OPEN' },
  });
  if (openCount >= config.maxOpenPerUser) {
    return {
      error:
        config.maxOpenPerUser === 1
          ? 'You already have an open ticket. Please use that one.'
          : `You already have ${config.maxOpenPerUser} open tickets. Please use one of those.`,
    };
  }
  return { config, type, categoryId: type.categoryId };
}

/** The pop-up form for a ticket type's opening questions. */
export function buildTicketForm(type: ResolvedTicketType): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(buildCustomId('ticket', 'form', type.id))
    .setTitle(type.label.slice(0, 45));
  type.questions.forEach((question, index) => {
    const input = new TextInputBuilder()
      .setCustomId(`q${index}`)
      .setLabel(question.label.slice(0, 45))
      .setStyle(question.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(question.required)
      .setMaxLength(question.long ? LONG_ANSWER_MAX : SHORT_ANSWER_MAX);
    if (question.placeholder) input.setPlaceholder(question.placeholder);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  });
  return modal;
}

/** The form staff (or the member, where allowed) fill in to close a ticket. */
export function buildCloseForm(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildCustomId('ticket', 'closeform'))
    .setTitle('Close this ticket')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason (optional)')
          .setPlaceholder('Shown in the log and sent to the member.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}

type TicketState = Pick<Ticket, 'number' | 'openerId' | 'typeLabel' | 'claimedById' | 'status'>;

function ticketTitle(ticket: Pick<Ticket, 'number' | 'typeLabel'>): string {
  return ticket.typeLabel
    ? `${ticket.typeLabel} · Ticket #${ticket.number}`
    : `Ticket #${ticket.number}`;
}

const HANDLED_BY = 'Handled by';

function handledByValue(claimedById: string | null): string {
  return claimedById ? `<@${claimedById}>` : 'Not claimed yet';
}

/** The buttons under a ticket's first message. */
function buildControlRow(ticket: TicketState): ActionRowBuilder<ButtonBuilder> {
  const closed = ticket.status !== 'OPEN';
  const claim = ticket.claimedById
    ? new ButtonBuilder()
        .setCustomId(buildCustomId('ticket', 'unclaim'))
        .setLabel('Unclaim')
        .setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder()
        .setCustomId(buildCustomId('ticket', 'claim'))
        .setLabel('Claim')
        .setEmoji('🙋')
        .setStyle(ButtonStyle.Success);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('ticket', 'close'))
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closed),
    claim.setDisabled(closed),
  );
}

/** The staff buttons under the "ticket closed" notice. */
function buildClosedRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('ticket', 'reopen'))
      .setLabel('Reopen')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildCustomId('ticket', 'transcript'))
      .setLabel('Transcript')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildCustomId('ticket', 'delete'))
      .setLabel('Delete')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Create a private ticket channel for `opener`. Returns the new channel id or
 * a user-facing error reason. Does not check the module-enabled flag — the
 * caller does (the component path checks the config cache).
 */
export async function openTicket(
  guild: Guild,
  opener: { id: string; username: string },
  typeId: string | null | undefined,
  answers: TicketAnswer[],
  deps: TicketDeps,
): Promise<{ channelId: string } | { error: string }> {
  const check = await checkCanOpen(guild, opener.id, typeId);
  if ('error' in check) return check;
  const { config, type, categoryId } = check;
  // With no types configured there is one built-in ticket, which has no name of its own.
  const named = config.types.length > 0;

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
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    ...type.supportRoleIds.map((roleId) => ({
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
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  const channel = await guild.channels
    .create({
      name: renderTicketChannelName(type.namePattern, {
        number,
        username: opener.username,
        type: type.label,
      }),
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `${named ? `${type.label} ticket` : 'Ticket'} #${number} • opened by <@${opener.id}>`,
      permissionOverwrites: overwrites,
    })
    .catch((err: unknown) => {
      deps.logger.warn({ err, guildId: guild.id }, 'Ticket channel create failed');
      return null;
    });
  if (!channel) {
    return {
      error:
        "I couldn't create the ticket channel. Please let staff know: I may be missing Manage Channels, or the category is full.",
    };
  }

  const ticket = await prisma.ticket.create({
    data: {
      guildId: guild.id,
      channelId: channel.id,
      number,
      openerId: opener.id,
      typeId: named ? type.id : null,
      typeLabel: named ? type.label : null,
      ...(answers.length > 0 ? { answers: answers as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  openTicketChannels.add(channel.id);

  const embed = brandedEmbed({ title: ticketTitle(ticket), description: type.openMessage });
  embed.addFields(
    { name: 'Opened by', value: `<@${opener.id}>`, inline: true },
    { name: HANDLED_BY, value: handledByValue(null), inline: true },
  );
  for (const { question, answer } of answers) {
    embed.addFields({ name: question.slice(0, 256), value: answer.slice(0, 1024) || '—' });
  }
  const pinged = config.pingSupport ? type.supportRoleIds : [];
  const control = await channel
    .send({
      content: [`<@${opener.id}>`, ...pinged.map((id) => `<@&${id}>`)].join(' '),
      embeds: [embed],
      components: [buildControlRow(ticket)],
      allowedMentions: { users: [opener.id], roles: pinged },
    })
    .catch(() => null);
  if (control) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { controlMessageId: control.id },
    });
  }

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

/** Redraw the first message's title, "Handled by" line and buttons from the ticket's state. */
async function refreshControlMessage(guild: Guild, ticket: Ticket): Promise<void> {
  if (!ticket.controlMessageId) return; // tickets opened before this existed
  const channel = resolveTicketChannel(guild, ticket.channelId);
  const message = await channel?.messages.fetch(ticket.controlMessageId).catch(() => null);
  if (!message) return;

  const embeds = message.embeds.map((existing, index) => {
    const embed = EmbedBuilder.from(existing);
    if (index !== 0) return embed;
    embed.setTitle(ticketTitle(ticket));
    const fields = [...(existing.fields ?? [])];
    const at = fields.findIndex((field) => field.name === HANDLED_BY);
    if (at >= 0) {
      embed.spliceFields(at, 1, {
        name: HANDLED_BY,
        value: handledByValue(ticket.claimedById),
        inline: true,
      });
    }
    return embed;
  });
  await message.edit({ embeds, components: [buildControlRow(ticket)] }).catch(() => undefined);
}

// ── Staff actions ────────────────────────────────────────────────────────────

/** Record who is handling a ticket (null = nobody) and show it on the ticket. */
export async function setTicketClaim(
  guild: Guild,
  ticket: Ticket,
  staffId: string | null,
): Promise<void> {
  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { claimedById: staffId },
  });
  await refreshControlMessage(guild, updated);
}

/**
 * Move a ticket to another type: its category, the staff roles that can see
 * it, and the label on the ticket. Returns a sentence when it can't be done.
 */
export async function moveTicket(
  guild: Guild,
  ticket: Ticket,
  target: ResolvedTicketType,
  config: TicketsConfig,
): Promise<string | null> {
  const channel = resolveTicketChannel(guild, ticket.channelId);
  if (!channel) return 'This ticket channel no longer exists.';
  if (!target.categoryId || !guild.channels.cache.has(target.categoryId)) {
    return `"${target.label}" has no category set, so tickets can't be moved to it.`;
  }

  try {
    if (channel.parentId !== target.categoryId) {
      await channel.setParent(target.categoryId, { lockPermissions: false });
    }
    const before = ticketStaffRoleIds(config, ticket.typeId);
    for (const roleId of before.filter((id) => !target.supportRoleIds.includes(id))) {
      await channel.permissionOverwrites.delete(roleId).catch(() => undefined);
    }
    for (const roleId of target.supportRoleIds) {
      await channel.permissionOverwrites.edit(roleId, STAFF_CHANNEL_PERMISSIONS);
    }
  } catch {
    return "I couldn't move the channel. Check that I have Manage Channels in both categories.";
  }

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { typeId: target.id, typeLabel: target.label },
  });
  await refreshControlMessage(guild, updated);
  return null;
}

/** Add or remove a member from the ticket block list. */
export async function setTicketBlocked(
  guildId: string,
  userId: string,
  blocked: boolean,
): Promise<'changed' | 'unchanged' | 'full'> {
  const config = await getTicketsConfig(guildId);
  const has = config.blockedUserIds.includes(userId);
  if (has === blocked) return 'unchanged';
  if (blocked && config.blockedUserIds.length >= TICKET_BLOCKED_MAX) return 'full';
  await saveTicketsConfig(guildId, {
    ...config,
    blockedUserIds: blocked
      ? [...config.blockedUserIds, userId]
      : config.blockedUserIds.filter((id) => id !== userId),
  });
  return 'changed';
}

/**
 * Whether to post a "member asked to close" note. One per ticket every few
 * minutes, so a member can't fill the channel by pressing Close repeatedly.
 */
export function shouldAnnounceCloseRequest(channelId: string): boolean {
  const now = Date.now();
  if (now - (lastCloseRequestAt.get(channelId) ?? 0) < CLOSE_REQUEST_THROTTLE_MS) return false;
  lastCloseRequestAt.set(channelId, now);
  return true;
}

/** The note posted when a member asks for their ticket to be closed. */
export function buildCloseRequestMessage(userId: string): BaseMessageOptions {
  return {
    embeds: [
      brandedEmbed({
        description: `<@${userId}> has asked for this ticket to be closed. Staff can close it below.`,
      }),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildCustomId('ticket', 'close'))
          .setLabel('Close ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

// ── Transcripts ──────────────────────────────────────────────────────────────

interface TranscriptFile {
  name: string;
  data: Buffer;
  messageCount: number;
}

async function nameOf(guild: Guild, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const member = guild.members.cache.get(userId);
  if (member) return member.displayName;
  const user = await guild.client.users.fetch(userId).catch(() => null);
  return user ? user.displayName : `User ${userId}`;
}

/** Every message in the channel, oldest first, up to the transcript limit. */
async function collectMessages(
  channel: TextChannel,
): Promise<{ messages: Message[]; truncated: boolean }> {
  const collected: Message[] = [];
  let before: string | undefined;
  let truncated = false;
  for (;;) {
    const batch = await channel.messages
      .fetch(before ? { limit: 100, before } : { limit: 100 })
      .catch(() => null);
    if (!batch || batch.size === 0) break;
    collected.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
    if (collected.length >= TRANSCRIPT_MAX_MESSAGES) {
      truncated = true;
      break;
    }
  }
  return { messages: collected.reverse(), truncated };
}

/** Copy a small image into the transcript; anything else is left as a link. */
async function inlineImage(
  url: string,
  contentType: string,
  logger: Logger,
): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > IMAGE_MAX_BYTES) return null;
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch (err) {
    logger.debug({ err }, 'Transcript image could not be inlined');
    return null;
  }
}

async function buildTranscript(
  guild: Guild,
  channel: TextChannel,
  ticket: Ticket,
  logger: Logger,
): Promise<TranscriptFile> {
  const { messages, truncated } = await collectMessages(channel);
  let imageBudget = IMAGE_BUDGET_BYTES;

  const rendered: TranscriptMessage[] = [];
  for (const message of messages) {
    const attachments: TranscriptAttachment[] = [];
    for (const attachment of message.attachments.values()) {
      const type = (attachment.contentType ?? '').split(';')[0]?.trim() ?? '';
      const isImage = type.startsWith('image/');
      let dataUri: string | null = null;
      if (
        INLINE_IMAGE_TYPES.has(type) &&
        attachment.size <= IMAGE_MAX_BYTES &&
        attachment.size <= imageBudget
      ) {
        dataUri = await inlineImage(attachment.url, type, logger);
        if (dataUri) imageBudget -= attachment.size;
      }
      attachments.push({
        name: attachment.name,
        url: attachment.url,
        isImage,
        ...(dataUri ? { dataUri } : {}),
      });
    }
    rendered.push({
      authorId: message.author.id,
      authorName: message.member?.displayName ?? message.author.displayName,
      authorAvatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 64 }),
      bot: message.author.bot,
      timestamp: message.createdTimestamp,
      content: message.cleanContent,
      attachments,
      embeds: message.embeds.map((embed) => ({
        ...(embed.title ? { title: embed.title } : {}),
        ...(embed.description ? { description: embed.description } : {}),
        fields: embed.fields.map((field) => ({ name: field.name, value: field.value })),
      })),
    });
  }

  const html = renderTranscriptHtml(
    {
      guildName: guild.name,
      channelName: channel.name,
      ticketNumber: ticket.number,
      typeLabel: ticket.typeLabel,
      openerName: (await nameOf(guild, ticket.openerId)) ?? 'Unknown member',
      claimedByName: await nameOf(guild, ticket.claimedById),
      closedByName: await nameOf(guild, ticket.closedById),
      closeReason: ticket.closeReason,
      openedAt: ticket.createdAt.getTime(),
      closedAt: ticket.closedAt ? ticket.closedAt.getTime() : null,
      truncated,
    },
    rendered,
  );
  return {
    name: `transcript-ticket-${String(ticket.number).padStart(4, '0')}.html`,
    data: Buffer.from(html, 'utf8'),
    messageCount: rendered.length,
  };
}

function transcriptAttachment(file: TranscriptFile): AttachmentBuilder {
  return new AttachmentBuilder(file.data, { name: file.name });
}

/** Post the transcript and a summary of the ticket to the transcript channel. */
async function logTranscript(
  guild: Guild,
  ticket: Ticket,
  file: TranscriptFile,
  config: TicketsConfig,
  heading: string,
): Promise<boolean> {
  if (!config.transcriptChannelId) return false;
  const target = resolveTextChannel(guild, config.transcriptChannelId);
  if (!target) return false;

  const embed = brandedEmbed({ title: heading });
  embed.addFields(
    { name: 'Opened by', value: `<@${ticket.openerId}>`, inline: true },
    { name: HANDLED_BY, value: handledByValue(ticket.claimedById), inline: true },
    { name: 'Closed by', value: ticket.closedById ? `<@${ticket.closedById}>` : '—', inline: true },
  );
  if (ticket.typeLabel) embed.addFields({ name: 'Type', value: ticket.typeLabel, inline: true });
  embed.addFields(
    {
      name: 'Opened',
      value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:f>`,
      inline: true,
    },
    { name: 'Messages', value: String(file.messageCount), inline: true },
  );
  if (ticket.closeReason) embed.addFields({ name: 'Reason', value: ticket.closeReason });

  const sent = await target
    .send({ embeds: [embed], files: [transcriptAttachment(file)], allowedMentions: { parse: [] } })
    .catch(() => null);
  return sent !== null;
}

/** Tell the member their ticket was closed, with the transcript when enabled. */
async function notifyOpener(
  guild: Guild,
  ticket: Ticket,
  file: TranscriptFile,
  config: TicketsConfig,
): Promise<void> {
  const user = await guild.client.users.fetch(ticket.openerId).catch(() => null);
  if (!user) return;
  const embed = brandedEmbed({
    title: 'Your ticket was closed',
    description: `${ticketTitle(ticket)} in **${guild.name}** has been closed${
      ticket.closedById && ticket.closedById !== guild.client.user.id
        ? ` by <@${ticket.closedById}>`
        : ''
    }.${config.dmTranscript ? ' A copy of the conversation is attached; open it in your browser.' : ''}`,
  });
  if (ticket.closeReason) embed.addFields({ name: 'Reason', value: ticket.closeReason });
  // Members with DMs off simply don't get the note.
  await user
    .send({ embeds: [embed], files: config.dmTranscript ? [transcriptAttachment(file)] : [] })
    .catch(() => undefined);
}

/**
 * Build a fresh transcript of a ticket on request (the Transcript button on a
 * closed ticket). It is posted to the transcript channel when one is set, and
 * returned so the caller can hand it to the staff member directly.
 */
export async function exportTranscript(
  channelId: string,
  deps: TicketDeps,
): Promise<{ file: AttachmentBuilder; logged: boolean } | null> {
  const ticket = await prisma.ticket.findUnique({ where: { channelId } });
  if (!ticket || ticket.deletedAt) return null;
  const guild = deps.client.guilds.cache.get(ticket.guildId);
  const channel = guild ? resolveTicketChannel(guild, channelId) : null;
  if (!guild || !channel) return null;
  const config = await getTicketsConfig(ticket.guildId);
  const file = await buildTranscript(guild, channel, ticket, deps.logger);
  const logged = await logTranscript(
    guild,
    ticket,
    file,
    config,
    `${ticketTitle(ticket)} · transcript`,
  );
  return { file: transcriptAttachment(file), logged };
}

// ── Closing, reopening, deleting ─────────────────────────────────────────────

/** Show or hide the ticket for every member added to it (the opener and anyone staff added). */
async function setMemberAccess(channel: TextChannel, visible: boolean): Promise<void> {
  const botId = channel.client.user.id;
  const members = channel.permissionOverwrites.cache.filter(
    (overwrite) => overwrite.type === OverwriteType.Member && overwrite.id !== botId,
  );
  for (const overwrite of members.values()) {
    await channel.permissionOverwrites
      .edit(overwrite.id, { ViewChannel: visible })
      .catch(() => undefined);
  }
}

const CLOSED_PREFIX = 'closed-';

/**
 * Rename without waiting: Discord allows two renames per channel every ten
 * minutes, and a queued rename must never hold up closing or reopening.
 */
function renameInBackground(channel: TextChannel, name: string, logger: Logger): void {
  void channel
    .setName(name.slice(0, 100))
    .catch((err: unknown) => logger.debug({ err }, 'Ticket rename failed'));
}

/**
 * Close a ticket: lock it (members lose access), archive a transcript, tell
 * the member, and leave the channel for staff to reopen or delete. Idempotent:
 * a ticket that isn't open is a no-op. Returns whether it acted.
 */
export async function closeTicket(
  channelId: string,
  closedById: string,
  deps: TicketDeps,
  reason: string | null = null,
): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({ where: { channelId } });
  if (!ticket || ticket.status !== 'OPEN') return false;

  // Atomic claim: only the first closer (e.g. manual click vs. auto-close
  // firing at the same instant) proceeds, so we never archive twice.
  const closedAt = new Date();
  const closeReason = reason?.trim() ? reason.trim().slice(0, 500) : null;
  const claimed = await prisma.ticket.updateMany({
    where: { id: ticket.id, status: 'OPEN' },
    data: { status: 'CLOSED', closedById, closedAt, closeReason },
  });
  if (claimed.count === 0) return false;
  openTicketChannels.delete(channelId);
  lastTouchAt.delete(channelId);
  lastCloseRequestAt.delete(channelId);
  await deps.jobs.cancel(QUEUE_NAMES.ticketAutoClose, ticketJobId(ticket.id));

  const closed: Ticket = { ...ticket, status: 'CLOSED', closedById, closedAt, closeReason };
  const guild = deps.client.guilds.cache.get(ticket.guildId);
  const channel = guild ? resolveTicketChannel(guild, channelId) : null;
  if (!guild || !channel) return true;
  const config = await getTicketsConfig(ticket.guildId);

  await setMemberAccess(channel, false);
  await refreshControlMessage(guild, closed);
  // Built before the notice below, so the transcript ends with the conversation.
  const file = await buildTranscript(guild, channel, closed, deps.logger).catch((err: unknown) => {
    deps.logger.warn({ err, ticketId: ticket.id }, 'Ticket transcript failed');
    return null;
  });

  const notice = brandedEmbed({
    title: 'Ticket closed',
    description: `Closed by <@${closedById}>. The member can no longer see this channel.\nStaff can reopen it, save another transcript, or delete it.`,
  });
  if (closeReason) notice.addFields({ name: 'Reason', value: closeReason });
  await channel
    .send({ embeds: [notice], components: [buildClosedRow()], allowedMentions: { parse: [] } })
    .catch(() => undefined);
  if (!channel.name.startsWith(CLOSED_PREFIX)) {
    renameInBackground(channel, `${CLOSED_PREFIX}${channel.name}`, deps.logger);
  }

  if (file) {
    await logTranscript(guild, closed, file, config, `${ticketTitle(closed)} closed`);
    await notifyOpener(guild, closed, file, config);
  }
  return true;
}

/** Reopen a closed ticket that still has its channel. Returns whether it acted. */
export async function reopenTicket(
  channelId: string,
  reopenedById: string,
  deps: TicketDeps,
): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({ where: { channelId } });
  if (!ticket || ticket.status !== 'CLOSED' || ticket.deletedAt) return false;
  const reopened = await prisma.ticket.updateMany({
    where: { id: ticket.id, status: 'CLOSED', deletedAt: null },
    data: {
      status: 'OPEN',
      closedById: null,
      closedAt: null,
      closeReason: null,
      lastActivityAt: new Date(),
    },
  });
  if (reopened.count === 0) return false;
  openTicketChannels.add(channelId);

  const open: Ticket = {
    ...ticket,
    status: 'OPEN',
    closedById: null,
    closedAt: null,
    closeReason: null,
  };
  const guild = deps.client.guilds.cache.get(ticket.guildId);
  const channel = guild ? resolveTicketChannel(guild, channelId) : null;
  if (guild && channel) {
    await setMemberAccess(channel, true);
    await refreshControlMessage(guild, open);
    await channel
      .send({
        content: `<@${ticket.openerId}>`,
        embeds: [
          brandedEmbed({ description: `🔓 This ticket was reopened by <@${reopenedById}>.` }),
        ],
        allowedMentions: { users: [ticket.openerId] },
      })
      .catch(() => undefined);
    if (channel.name.startsWith(CLOSED_PREFIX)) {
      renameInBackground(channel, channel.name.slice(CLOSED_PREFIX.length), deps.logger);
    }
  }

  const config = await getTicketsConfig(ticket.guildId);
  if (config.autoCloseHours > 0) {
    await deps.jobs.schedule(
      QUEUE_NAMES.ticketAutoClose,
      'ticketAutoClose',
      { ticketId: ticket.id },
      { delayMs: config.autoCloseHours * HOUR_MS, jobId: ticketJobId(ticket.id) },
    );
  }
  return true;
}

/** Delete a closed ticket's channel for good. Returns whether it acted. */
export async function deleteTicket(
  channelId: string,
  deletedBy: string,
  deps: TicketDeps,
): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({ where: { channelId } });
  if (!ticket || ticket.status !== 'CLOSED' || ticket.deletedAt) return false;
  const marked = await prisma.ticket.updateMany({
    where: { id: ticket.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (marked.count === 0) return false;

  const guild = deps.client.guilds.cache.get(ticket.guildId);
  const channel = guild ? resolveTicketChannel(guild, channelId) : null;
  if (channel) {
    await channel
      .delete(`Ticket #${ticket.number} deleted by ${deletedBy}`)
      .catch((err: unknown) =>
        deps.logger.warn({ err, channelId }, 'Ticket channel delete failed'),
      );
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
 * A ticket channel was deleted (by the Delete button, or by hand). Record it
 * and drop its timers so reconcile/auto-close don't chase a dead channel.
 */
export async function onTicketChannelDeleted(
  channelId: string,
  deps: Pick<TicketDeps, 'jobs'>,
): Promise<void> {
  openTicketChannels.delete(channelId);
  lastTouchAt.delete(channelId);
  lastCloseRequestAt.delete(channelId);
  const ticket = await prisma.ticket.findUnique({
    where: { channelId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!ticket || ticket.deletedAt) return;
  const now = new Date();
  await prisma.ticket.updateMany({
    where: { id: ticket.id, deletedAt: null },
    data:
      ticket.status === 'OPEN'
        ? { status: 'CLOSED', closedAt: now, deletedAt: now }
        : { deletedAt: now },
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
