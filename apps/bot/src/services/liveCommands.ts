import type { Client } from 'discord.js';
import { prisma } from '@helios/database';
import { QUEUE_NAMES } from '@helios/jobs';
import {
  REDIS_CHANNELS,
  type DeletePanelPayload,
  type DeployPanelPayload,
  type GiveawayActionPayload,
  type DeployTicketPanelPayload,
  type LiveCommandMessage,
  type RefxAlertPayload,
  type RolePanelOption,
  type ScheduledMessagePayload,
} from '@helios/shared';
import type { Logger } from '../logger';
import { subscriber } from './redis';
import { buildPanelMessage } from '../modules/roles';
import { endGiveaway, rerollGiveaway } from '../modules/giveaway';
import { armScheduledMessage } from '../modules/scheduledMessages';
import { buildTicketPanelMessage, getTicketsConfig } from '../modules/tickets';
import { postRefxAlert } from '../modules/refxAlerts';
import { refreshStatsCounters } from '../modules/statsCounters';
import { scheduledMessageJobId, type JobService } from './jobs';
import type { ConfigCache } from './configCache';

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
      case 'REFX_ALERT':
        await postRefxAlert(
          this.client,
          this.config,
          this.logger,
          message.guildId,
          message.payload as RefxAlertPayload,
        );
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
