import type { Client, EmbedBuilder } from 'discord.js';
import { prisma } from '@solari/database';
import { QUEUE_NAMES } from '@solari/jobs';
import {
  REDIS_CHANNELS,
  type DeletePanelPayload,
  type DeployPanelPayload,
  type GiveawayActionPayload,
  type DeployTicketPanelPayload,
  type DeployVerifyPanelPayload,
  type DeployApplicationPanelPayload,
  type ApplicationSideEffectsPayload,
  type LockdownStartPayload,
  type LiveCommandMessage,
  type RolePanelOption,
  type ScheduledMessagePayload,
} from '@solari/shared';
import type { Logger } from '../logger';
import { subscriber } from './redis';
import { buildPanelMessage } from '../modules/roles';
import { endGiveaway, rerollGiveaway } from '../modules/giveaway';
import { armScheduledMessage } from '../modules/scheduledMessages';
import { autoSetupTickets, buildTicketPanelMessage, getTicketsConfig } from '../modules/tickets';
import { buildVerificationPanel } from '../modules/verification';
import {
  buildApplyPanelMessage,
  getEnabledForms,
  runDecisionSideEffects,
} from '../modules/applications';
import { endLockdown, lockdownServer } from '../modules/lockdown';
import { brandedEmbed } from '../lib/embeds';
import { refreshStatsCounters } from '../modules/statsCounters';
import { scheduledMessageJobId, type JobService } from './jobs';
import type { ConfigCache } from './configCache';
import type { CustomBotManager } from './customBots';

/**
 * Subscribes to `helios:command` (§4.3). Uses broadcast-and-filter: every shard
 * receives the message but only the one that owns the guild acts.
 */
export class LiveCommandService {
  constructor(
    private readonly client: Client,
    private readonly logger: Logger,
    private readonly jobs: JobService,
    private readonly config: ConfigCache,
    private readonly customBots: CustomBotManager,
  ) {}

  async start(): Promise<void> {
    await subscriber.subscribe(REDIS_CHANNELS.command);
    subscriber.on('message', (channel, raw) => {
      if (channel !== REDIS_CHANNELS.command) return;
      void this.dispatch(raw).catch((err: unknown) =>
        this.logger.error({ err }, 'Live command handler failed'),
      );
    });
    this.logger.info('Live-command subscriber started');
  }

  private async dispatch(raw: string): Promise<void> {
    const message = JSON.parse(raw) as LiveCommandMessage;
    if (!this.client.guilds.cache.has(message.guildId)) return; // not our shard's guild

    switch (message.type) {
      case 'RESTART_CUSTOM_BOT':
        // (Re)start or stop this guild's custom bot from its latest DB row.
        await this.customBots.start(message.guildId);
        return;
      case 'DEPLOY_PANEL':
        await this.deployPanel(message.guildId, message.payload as DeployPanelPayload);
        return;
      case 'DELETE_PANEL':
        await this.deletePanel(message.guildId, message.payload as DeletePanelPayload);
        return;
      case 'END_GIVEAWAY':
        await endGiveaway((message.payload as GiveawayActionPayload).giveawayId, {
          client: this.client,
          logger: this.logger,
        });
        return;
      case 'REROLL_GIVEAWAY':
        await rerollGiveaway((message.payload as GiveawayActionPayload).giveawayId, {
          client: this.client,
          logger: this.logger,
        });
        return;
      case 'SCHEDULE_MESSAGE':
        await armScheduledMessage((message.payload as ScheduledMessagePayload).scheduledMessageId, {
          client: this.client,
          logger: this.logger,
          jobs: this.jobs,
        });
        return;
      case 'CANCEL_SCHEDULED_MESSAGE':
        await this.jobs.cancel(
          QUEUE_NAMES.scheduledMessage,
          scheduledMessageJobId((message.payload as ScheduledMessagePayload).scheduledMessageId),
        );
        return;
      case 'DEPLOY_TICKET_PANEL':
        await this.deployTicketPanel(
          message.guildId,
          (message.payload as DeployTicketPanelPayload).channelId,
        );
        return;
      case 'SETUP_TICKETS':
        // Zero-config bootstrap when the module is enabled unconfigured.
        await autoSetupTickets(message.guildId, {
          client: this.client,
          jobs: this.jobs,
          logger: this.logger,
        });
        return;
      case 'REFRESH_COMMAND_TOGGLES':
        this.config.invalidateCommandToggles(message.guildId);
        return;
      case 'DEPLOY_VERIFY_PANEL':
        await this.deployVerifyPanel(
          message.guildId,
          (message.payload as DeployVerifyPanelPayload).channelId,
        );
        return;
      case 'DEPLOY_APPLICATION_PANEL':
        await this.deployApplicationPanel(
          message.guildId,
          (message.payload as DeployApplicationPanelPayload).channelId,
        );
        return;
      case 'APPLICATION_SIDE_EFFECTS':
        // Dashboard already wrote the decision; carry out role/DM/message edits.
        await runDecisionSideEffects((message.payload as ApplicationSideEffectsPayload).submissionId, {
          client: this.client,
          logger: this.logger,
        });
        return;
      case 'LOCKDOWN_START':
        await this.startLockdown(message.guildId, message.payload as LockdownStartPayload);
        return;
      case 'LOCKDOWN_END':
        await this.liftLockdown(message.guildId);
        return;
      case 'REFRESH_STATS':
        await refreshStatsCounters(message.guildId, {
          client: this.client,
          logger: this.logger,
          jobs: this.jobs,
        });
        return;
      default:
        return;
    }
  }

  private async deployPanel(guildId: string, payload: DeployPanelPayload): Promise<void> {
    const panel = await prisma.reactionRolePanel.findUnique({ where: { id: payload.panelId } });
    if (!panel || panel.guildId !== guildId || !panel.channelId) return;

    const guild = this.client.guilds.cache.get(guildId);
    const channel =
      guild?.channels.cache.get(panel.channelId) ??
      (await guild?.channels.fetch(panel.channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

    const messageBody = buildPanelMessage({
      id: panel.id,
      title: panel.title,
      description: panel.description,
      mode: panel.mode,
      type: panel.type,
      options: panel.options as RolePanelOption[],
    });

    try {
      if (panel.messageId) {
        const existing = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (existing) {
          await existing.edit(messageBody);
          return;
        }
      }
      const sent = await channel.send(messageBody);
      await prisma.reactionRolePanel.update({
        where: { id: panel.id },
        data: { messageId: sent.id },
      });
    } catch (err) {
      this.logger.warn({ err, panelId: panel.id }, 'Deploy panel failed');
    }
  }

  private async deployTicketPanel(guildId: string, channelId: string): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    const channel =
      guild?.channels.cache.get(channelId) ??
      (await guild?.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
    const config = await getTicketsConfig(guildId);
    await channel
      .send(buildTicketPanelMessage(config))
      .catch((err: unknown) =>
        this.logger.warn({ err, guildId, channelId }, 'Deploy ticket panel failed'),
      );
  }

  private async deployVerifyPanel(guildId: string, channelId: string): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    const channel =
      guild?.channels.cache.get(channelId) ??
      (await guild?.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
    const config = await this.config.getConfig(guildId, 'VERIFICATION');
    await channel
      .send(buildVerificationPanel(config))
      .catch((err: unknown) =>
        this.logger.warn({ err, guildId, channelId }, 'Deploy verification panel failed'),
      );
  }

  private async deployApplicationPanel(guildId: string, channelId: string): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    const channel =
      guild?.channels.cache.get(channelId) ??
      (await guild?.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
    const forms = await getEnabledForms(guildId);
    if (forms.length === 0) return;
    await channel
      .send(buildApplyPanelMessage(forms))
      .catch((err: unknown) =>
        this.logger.warn({ err, guildId, channelId }, 'Deploy application panel failed'),
      );
  }

  /** Post a summary embed to the guild's mod-log channel (best-effort). */
  private async postModLog(guildId: string, embed: EmbedBuilder): Promise<void> {
    const config = await this.config.getConfig(guildId, 'MODERATION');
    const channelId = config.modLogChannelId;
    if (!channelId) return;
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased() && !channel.isDMBased() && 'send' in channel) {
      await channel.send({ embeds: [embed] }).catch(() => undefined);
    }
  }

  private async startLockdown(guildId: string, payload: LockdownStartPayload): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const { locked, skipped } = await lockdownServer(
      guild,
      payload.moderatorId,
      payload.reason ?? null,
      { announce: true },
    );
    await this.postModLog(
      guildId,
      brandedEmbed({
        kind: 'danger',
        title: '🔒 Server lockdown started',
        description:
          `Triggered from the dashboard.\n**Channels locked:** ${locked}` +
          (skipped ? ` (skipped ${skipped})` : '') +
          (payload.reason ? `\n**Reason:** ${payload.reason}` : ''),
      }),
    );
  }

  private async liftLockdown(guildId: string): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const { restored } = await endLockdown(guild, { announce: true });
    if (restored > 0) {
      await this.postModLog(
        guildId,
        brandedEmbed({
          kind: 'success',
          title: '🔓 Server lockdown lifted',
          description: `Triggered from the dashboard.\n**Channels restored:** ${restored}`,
        }),
      );
    }
  }

  private async deletePanel(guildId: string, payload: DeletePanelPayload): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    const channel =
      guild?.channels.cache.get(payload.channelId) ??
      (await guild?.channels.fetch(payload.channelId).catch(() => null));
    if (channel && channel.isTextBased() && !channel.isDMBased()) {
      await channel.messages.delete(payload.messageId).catch(() => undefined);
    }
  }
}
