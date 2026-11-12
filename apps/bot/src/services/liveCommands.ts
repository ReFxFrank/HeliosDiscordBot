import type { Client, EmbedBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import { QUEUE_NAMES } from '@refx/jobs';
import {
  embedSpecSchema,
  LIVE_RESULT_TTL_SECONDS,
  REDIS_CHANNELS,
  liveResultKey,
  type DeletePanelPayload,
  type DeployEmbedPayload,
  type DeployPanelPayload,
  type GiveawayActionPayload,
  type DeployTicketPanelPayload,
  type DeployVerifyPanelPayload,
  type DeployApplicationPanelPayload,
  type FivemRefreshPayload,
  type ApplicationSideEffectsPayload,
  type ApplyServerTemplatePayload,
  type LockdownStartPayload,
  type LiveCommandMessage,
  type LiveCommandResult,
  type ScheduledMessagePayload,
  type SocialSubscriptionPayload,
} from '@refx/shared';
import type { Logger } from '../logger';
import { redis, subscriber } from './redis';
import { deployRolePanel } from '../modules/rolePanelDeploy';
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
import { applyServerTemplate } from '../modules/serverTemplate';
import { syncStayVoice } from '../modules/stayVoice';
import { baselineSubscription, cancelSocialPoll, scheduleSocialPoll } from '../modules/social';
import { brandedEmbed } from '../lib/embeds';
import { buildEmbedFromSpec } from '../lib/embedSpec';
import { refreshStatsCounters } from '../modules/statsCounters';
import { scheduledMessageJobId, type JobService } from './jobs';
import type { ConfigCache } from './configCache';
import type { FivemService } from '../modules/fivem';

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
    private readonly fivem: FivemService,
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
      case 'FIVEM_REFRESH':
        await this.fivem.refresh(
          message.guildId,
          Boolean((message.payload as FivemRefreshPayload | undefined)?.repost),
        );
        return;
      case 'SOCIAL_SUBSCRIBE': {
        const { subscriptionId } = message.payload as SocialSubscriptionPayload;
        // Baseline to the source's current latest so the backlog isn't dumped.
        await baselineSubscription(subscriptionId).catch(() => undefined);
        await scheduleSocialPoll(this.jobs, subscriptionId);
        return;
      }
      case 'SOCIAL_UNSUBSCRIBE':
        await cancelSocialPoll(
          this.jobs,
          (message.payload as SocialSubscriptionPayload).subscriptionId,
        );
        return;
      case 'DEPLOY_PANEL':
        await this.deployPanel(message.guildId, message.payload as DeployPanelPayload);
        return;
      case 'DEPLOY_EMBED':
        await this.deployEmbed(message.guildId, message.payload as DeployEmbedPayload);
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
        await runDecisionSideEffects(
          (message.payload as ApplicationSideEffectsPayload).submissionId,
          {
            client: this.client,
            logger: this.logger,
          },
        );
        return;
      case 'LOCKDOWN_START':
        await this.startLockdown(message.guildId, message.payload as LockdownStartPayload);
        return;
      case 'LOCKDOWN_END':
        await this.liftLockdown(message.guildId);
        return;
      case 'APPLY_SERVER_TEMPLATE': {
        const guild = this.client.guilds.cache.get(message.guildId);
        if (!guild) return;
        const payload = message.payload as ApplyServerTemplatePayload;
        const outcome = await applyServerTemplate(guild, payload.templateId, payload.actorId, {
          logger: this.logger,
        });
        // The bot posts its own in-guild summary; just log a dashboard failure.
        if (!outcome.ok) {
          this.logger.warn(
            { guildId: message.guildId, error: outcome.error },
            'Dashboard server-template apply failed',
          );
        }
        return;
      }
      case 'SYNC_STAY_VOICE': {
        // Explicit settings change — the only path allowed to disconnect when
        // the stay channel was cleared. (Still yields to an active music player.)
        const guild = this.client.guilds.cache.get(message.guildId);
        if (guild) await syncStayVoice(guild, this.logger, { allowDisconnect: true });
        return;
      }
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

  /**
   * Post a role panel and, when the dashboard is waiting (`requestId`), report
   * the outcome so a failure reaches the admin with its reason.
   */
  private async deployPanel(guildId: string, payload: DeployPanelPayload): Promise<void> {
    let result: LiveCommandResult;
    try {
      result = await deployRolePanel(this.client, this.logger, guildId, payload.panelId);
    } catch (err) {
      this.logger.error({ err, panelId: payload.panelId }, 'Deploy panel crashed');
      result = { ok: false, error: 'The bot hit an unexpected error posting the panel.' };
    }
    if (payload.requestId) {
      await redis
        .set(
          liveResultKey(payload.requestId),
          JSON.stringify(result),
          'EX',
          LIVE_RESULT_TTL_SECONDS,
        )
        .catch(() => undefined);
    }
  }

  /**
   * Post a SavedEmbed to its channel — or, when it was already posted and the
   * message still exists, edit that message in place so a deployed read-me can
   * be updated without a re-post.
   */
  private async deployEmbed(guildId: string, payload: DeployEmbedPayload): Promise<void> {
    const row = await prisma.savedEmbed.findUnique({ where: { id: payload.embedId } });
    if (!row || row.guildId !== guildId || !row.channelId) return;

    const guild = this.client.guilds.cache.get(guildId);
    const channel =
      guild?.channels.cache.get(row.channelId) ??
      (await guild?.channels.fetch(row.channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

    const parsed = embedSpecSchema.safeParse(row.spec);
    if (!parsed.success) {
      this.logger.warn({ embedId: row.id }, 'Deploy embed skipped: stored spec invalid');
      return;
    }
    const embed = buildEmbedFromSpec(parsed.data);
    const content = row.content?.trim() ? row.content : undefined;
    if (!embed && !content) return; // nothing renderable

    try {
      if (row.messageId) {
        const existing = await channel.messages.fetch(row.messageId).catch(() => null);
        if (existing) {
          await existing.edit({ content: content ?? null, embeds: embed ? [embed] : [] });
          return;
        }
      }
      const sent = await channel.send({ content, embeds: embed ? [embed] : [] });
      await prisma.savedEmbed.update({ where: { id: row.id }, data: { messageId: sent.id } });
    } catch (err) {
      this.logger.warn({ err, embedId: row.id }, 'Deploy embed failed');
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
    const { raid } = await this.config.getConfig(guildId, 'AUTOMOD');
    const { locked, skipped } = await lockdownServer(
      guild,
      payload.moderatorId,
      payload.reason ?? null,
      { announce: true, exemptRoleIds: raid.lockdownExemptRoleIds },
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
