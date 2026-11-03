import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type Guild,
  type Message,
  type MessageCreateOptions,
} from 'discord.js';
import {
  BRAND,
  COLORS,
  FIVEM_REDIS_KEYS,
  discordIdFromIdentifiers,
  fivemConnectAddress,
  nextRestart,
  type FivemConfig,
  type FivemPlayer,
  type FivemSnapshot,
} from '@refx/shared';
import { buildCustomId } from '../framework/customId';
import type { BotContext } from '../framework/context';

/**
 * FiveM city integration. One ticker per shard polls every guild with the
 * FIVEM module on, then:
 *
 *   - edits the live status panel (one bot-owned message, id kept in Redis),
 *   - sets the bot's presence ("42/128 in the city"),
 *   - posts up/down alerts on state changes (after `offlineAfterFailures`
 *     consecutive misses, so one dropped poll doesn't page anyone),
 *   - posts restart warnings ahead of each scheduled restart.
 *
 * The snapshot goes to Redis so `/status`, `/players` and the dashboard read
 * the same thing without hitting the game server again.
 */

const TICK_MS = 15_000;
const FETCH_TIMEOUT_MS = 5_000;
/** An outage this close to a scheduled restart is reported as the restart. */
const RESTART_GRACE_MS = 10 * 60_000;
/** Restart warnings are only sent within this window after their mark. */
const WARN_WINDOW_MS = 90_000;

interface GuildState {
  lastPollAt: number;
  failures: number;
  /** null until the first poll settles, so a bot restart never alerts. */
  online: boolean | null;
  onlineSince: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'ReFx-Assistant' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return (await res.json()) as T;
}

interface DynamicJson {
  hostname?: string;
  clients?: number;
  sv_maxclients?: number | string;
}
interface PlayerJson {
  id?: number;
  name?: string;
  ping?: number;
  identifiers?: string[];
}

/** Strip FiveM colour codes (^1..^9) from a hostname. */
function stripColours(text: string): string {
  return text.replace(/\^\d/g, '').trim();
}

/** Poll the server's own endpoints. Throws when the server is unreachable. */
export async function pollFivem(
  config: Pick<FivemConfig, 'host' | 'port'>,
): Promise<Omit<FivemSnapshot, 'onlineSince' | 'checkedAt'>> {
  const base = `http://${config.host.trim()}:${config.port}`;
  const [dynamic, players] = await Promise.all([
    fetchJson<DynamicJson>(`${base}/dynamic.json`),
    // players.json can be locked down (sv_requestParanoia); the count still works.
    fetchJson<PlayerJson[]>(`${base}/players.json`).catch(() => null),
  ]);
  const list: FivemPlayer[] = (players ?? [])
    .map((p) => ({
      id: Number(p.id ?? 0),
      name: String(p.name ?? 'Unknown').slice(0, 64),
      ping: Number(p.ping ?? 0),
      discordId: discordIdFromIdentifiers(p.identifiers ?? []),
    }))
    .sort((a, b) => a.id - b.id);
  return {
    online: true,
    players: list,
    maxPlayers: Number(dynamic.sv_maxclients ?? 0) || 0,
    hostname: stripColours(String(dynamic.hostname ?? '')),
  };
}

/** Player count from a snapshot: the list when we have it. */
export function playerCount(snapshot: FivemSnapshot): number {
  return snapshot.players.length;
}

function formatUptime(since: string | null, now: number): string {
  if (!since) return '--';
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** The status embed shared by the panel and `/status`. */
export function buildStatusEmbed(
  config: FivemConfig,
  snapshot: FivemSnapshot | null,
  iconUrl: string | null = null,
): EmbedBuilder {
  const now = Date.now();
  const online = snapshot?.online ?? false;
  const address = fivemConnectAddress(config);
  const restart = nextRestart(config, new Date(now));
  const embed = new EmbedBuilder()
    .setColor(online ? COLORS.success : COLORS.danger)
    .setAuthor({ name: BRAND.name })
    .setTitle(config.serverName)
    .addFields(
      { name: 'STATUS', value: online ? '🟢 Online' : '🔴 Offline', inline: true },
      {
        name: 'PLAYERS',
        value: snapshot && online ? `${playerCount(snapshot)}/${snapshot.maxPlayers}` : '0/0',
        inline: true,
      },
      {
        name: 'UPTIME',
        value: online ? formatUptime(snapshot?.onlineSince ?? null, now) : '--',
        inline: true,
      },
      {
        name: 'F8 CONNECT COMMAND',
        value: address ? `\`\`\`connect ${address}\`\`\`` : '*Not configured*',
      },
      {
        name: 'NEXT RESTART',
        value: restart
          ? `<t:${Math.floor(restart.getTime() / 1000)}:t> (<t:${Math.floor(restart.getTime() / 1000)}:R>)`
          : 'Not scheduled',
      },
    )
    .setFooter({ text: `${BRAND.footer} • Updated every ${config.pollIntervalSeconds}s` })
    .setTimestamp(snapshot ? new Date(snapshot.checkedAt) : new Date(now));
  if (iconUrl) embed.setThumbnail(iconUrl);
  if (config.panelImageUrl) embed.setImage(config.panelImageUrl);
  return embed;
}

/** Connect (cfx.re join link) + Players buttons under the panel. */
export function buildStatusComponents(config: FivemConfig) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const code = config.joinCode.trim();
  if (code) {
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Connect')
        .setEmoji('🎮')
        .setURL(`https://cfx.re/join/${encodeURIComponent(code)}`),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Players')
      .setEmoji('👥')
      .setCustomId(buildCustomId('fivem', 'players')),
  );
  return [row];
}

/** `/players` and the Players button: names, ids and pings, trimmed to fit. */
export function buildPlayersEmbed(
  config: FivemConfig,
  snapshot: FivemSnapshot | null,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(`${config.serverName} — players`)
    .setFooter({ text: BRAND.footer })
    .setTimestamp(snapshot ? new Date(snapshot.checkedAt) : new Date());
  if (!snapshot?.online) return embed.setDescription('🔴 The city is offline right now.');
  if (snapshot.players.length === 0) {
    return embed.setDescription(
      snapshot.maxPlayers > 0
        ? `Nobody in the city right now (0/${snapshot.maxPlayers}).`
        : 'Nobody in the city right now.',
    );
  }
  const lines: string[] = [];
  let length = 0;
  for (const p of snapshot.players) {
    const who = p.discordId ? ` · <@${p.discordId}>` : '';
    const line = `\`${String(p.id).padStart(3, ' ')}\` ${p.name.replace(/[`*_~|]/g, '')}${who} · ${p.ping}ms`;
    if (length + line.length + 1 > 3900) {
      lines.push(`…and ${snapshot.players.length - lines.length} more`);
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }
  return embed
    .setDescription(lines.join('\n'))
    .setAuthor({ name: `${snapshot.players.length}/${snapshot.maxPlayers} in the city` });
}

/** Read the last snapshot for a guild from Redis. */
export async function readSnapshot(ctx: Pick<BotContext, 'redis'>, guildId: string) {
  const raw = await ctx.redis.get(FIVEM_REDIS_KEYS.status(guildId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FivemSnapshot;
  } catch {
    return null;
  }
}

export class FivemService {
  private readonly state = new Map<string, GuildState>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private readonly ctx: Omit<BotContext, 'fivem'>) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Re-render a guild's panel now (dashboard save / deploy button). Only a
   * `repost` creates a panel message; otherwise an existing one is edited.
   */
  async refresh(guildId: string, repost = false): Promise<void> {
    const guild = this.ctx.client.guilds.cache.get(guildId);
    if (!guild) return;
    if (repost) await this.ctx.redis.del(FIVEM_REDIS_KEYS.panelMessage(guildId)).catch(() => 0);
    const st = this.state.get(guildId);
    if (st) st.lastPollAt = 0;
    await this.pollGuild(guild, true, repost);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      let presenceSet = false;
      for (const guild of this.ctx.client.guilds.cache.values()) {
        const snapshot = await this.pollGuild(guild, false).catch((err: unknown) => {
          this.ctx.logger.warn({ err, guildId: guild.id }, 'FiveM poll failed');
          return null;
        });
        if (!presenceSet && snapshot) presenceSet = await this.updatePresence(guild, snapshot);
      }
    } finally {
      this.ticking = false;
    }
  }

  /** Poll one guild if due. Returns the snapshot used (fresh or cached), or null when off. */
  private async pollGuild(
    guild: Guild,
    force: boolean,
    postPanel = false,
  ): Promise<FivemSnapshot | null> {
    if (!(await this.ctx.config.isEnabled(guild.id, 'FIVEM'))) return null;
    const config = await this.ctx.config.getConfig(guild.id, 'FIVEM');
    if (!config.host.trim()) return null;

    const now = Date.now();
    let st = this.state.get(guild.id);
    if (!st) {
      const previous = await readSnapshot(this.ctx, guild.id);
      st = {
        lastPollAt: 0,
        failures: 0,
        online: null,
        onlineSince: previous?.online ? previous.onlineSince : null,
      };
      this.state.set(guild.id, st);
    }

    await this.maybeWarnRestart(guild, config, now);

    if (!force && now - st.lastPollAt < config.pollIntervalSeconds * 1000) {
      return readSnapshot(this.ctx, guild.id);
    }
    st.lastPollAt = now;

    let snapshot: FivemSnapshot;
    try {
      const result = await pollFivem(config);
      st.failures = 0;
      if (!st.onlineSince) st.onlineSince = new Date(now).toISOString();
      snapshot = { ...result, onlineSince: st.onlineSince, checkedAt: new Date(now).toISOString() };
      if (st.online === false) await this.sendAlert(guild, config, 'up', snapshot);
      st.online = true;
    } catch (err) {
      st.failures += 1;
      const previous = await readSnapshot(this.ctx, guild.id);
      if (st.failures < config.offlineAfterFailures && previous) {
        // Not declared down yet: keep showing the last good state.
        this.ctx.logger.debug(
          { err, guildId: guild.id, failures: st.failures },
          'FiveM poll missed',
        );
        return previous;
      }
      snapshot = {
        online: false,
        players: [],
        maxPlayers: previous?.maxPlayers ?? 0,
        hostname: previous?.hostname ?? '',
        onlineSince: null,
        checkedAt: new Date(now).toISOString(),
      };
      if (st.online === true) await this.sendAlert(guild, config, 'down', snapshot);
      st.online = false;
      st.onlineSince = null;
    }

    await this.ctx.redis
      .set(FIVEM_REDIS_KEYS.status(guild.id), JSON.stringify(snapshot), 'EX', 3600)
      .catch(() => undefined);
    await this.updatePanel(guild, config, snapshot, postPanel);
    return snapshot;
  }

  private async updatePresence(guild: Guild, snapshot: FivemSnapshot): Promise<boolean> {
    const config = await this.ctx.config.getConfig(guild.id, 'FIVEM');
    if (!config.presenceEnabled) return false;
    const client: Client = this.ctx.client;
    const text = snapshot.online
      ? config.presenceFormat
          .replaceAll('{players}', String(playerCount(snapshot)))
          .replaceAll('{max}', String(snapshot.maxPlayers))
          .replaceAll('{server}', config.serverName)
      : `${config.serverName} is offline`;
    client.user?.setActivity({ name: text.slice(0, 128), type: ActivityType.Watching });
    return true;
  }

  private async sendable(guild: Guild, channelId: string | null) {
    if (!channelId) return null;
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    return channel && channel.isTextBased() && !channel.isDMBased() ? channel : null;
  }

  /**
   * Edit the panel message in place. A new message is only posted when
   * `allowPost` is set (the dashboard's "Post new panel"), so turning the module
   * on or running /refx-setup never posts into a channel by itself.
   */
  private async updatePanel(
    guild: Guild,
    config: FivemConfig,
    snapshot: FivemSnapshot,
    allowPost: boolean,
  ) {
    const channel = await this.sendable(guild, config.panelChannelId);
    if (!channel) return;
    const payload = {
      embeds: [buildStatusEmbed(config, snapshot, guild.iconURL({ extension: 'png', size: 256 }))],
      components: buildStatusComponents(config),
    };
    const key = FIVEM_REDIS_KEYS.panelMessage(guild.id);
    const stored = await this.ctx.redis.get(key).catch(() => null);
    let message: Message | null = null;
    if (stored) {
      const [channelId, messageId] = stored.split(':');
      if (channelId === channel.id && messageId) {
        message = await channel.messages.fetch(messageId).catch(() => null);
      }
    }
    if (message) {
      await message
        .edit(payload)
        .catch((err: unknown) =>
          this.ctx.logger.warn({ err, guildId: guild.id }, 'FiveM panel edit failed'),
        );
      return;
    }
    if (!allowPost) return;
    const sent = await channel.send(payload as MessageCreateOptions).catch((err: unknown) => {
      this.ctx.logger.warn({ err, guildId: guild.id }, 'FiveM panel post failed');
      return null;
    });
    if (sent) await this.ctx.redis.set(key, `${channel.id}:${sent.id}`).catch(() => undefined);
  }

  private nearRestart(config: FivemConfig, now: number): boolean {
    // The restart that just happened is the "next" one as seen 10 minutes ago.
    const previous = nextRestart(config, new Date(now - RESTART_GRACE_MS));
    return previous !== null && Math.abs(previous.getTime() - now) <= RESTART_GRACE_MS;
  }

  private async sendAlert(
    guild: Guild,
    config: FivemConfig,
    kind: 'up' | 'down',
    snapshot: FivemSnapshot,
  ): Promise<void> {
    const channel = await this.sendable(guild, config.alertsChannelId);
    if (!channel) return;
    const now = Date.now();
    const address = fivemConnectAddress(config);
    const embed = new EmbedBuilder().setFooter({ text: BRAND.footer }).setTimestamp(now);
    if (kind === 'down') {
      const restart = this.nearRestart(config, now);
      embed
        .setColor(restart ? COLORS.warning : COLORS.danger)
        .setTitle(restart ? '🔁 Scheduled restart' : '🔴 City offline')
        .setDescription(
          restart
            ? `${config.serverName} is restarting. It'll be back in a few minutes.`
            : `${config.serverName} isn't responding. Staff have been notified. Hang tight!`,
        );
    } else {
      embed
        .setColor(COLORS.success)
        .setTitle('🟢 City is back online')
        .setDescription(
          `${config.serverName} is up with ${playerCount(snapshot)}/${snapshot.maxPlayers} players.` +
            (address ? `\nF8: \`connect ${address}\`` : ''),
        );
    }
    await channel
      .send({
        content: config.alertsRoleId ? `<@&${config.alertsRoleId}>` : undefined,
        embeds: [embed],
        allowedMentions: { roles: config.alertsRoleId ? [config.alertsRoleId] : [] },
      })
      .catch((err: unknown) =>
        this.ctx.logger.warn({ err, guildId: guild.id }, 'FiveM alert failed'),
      );
  }

  private async maybeWarnRestart(guild: Guild, config: FivemConfig, now: number): Promise<void> {
    if (!config.alertsChannelId || config.restartWarnMinutes.length === 0) return;
    const restart = nextRestart(config, new Date(now));
    if (!restart) return;
    const msUntil = restart.getTime() - now;
    for (const minutes of config.restartWarnMinutes) {
      const mark = minutes * 60_000;
      if (msUntil > mark || msUntil <= mark - WARN_WINDOW_MS) continue;
      // SET NX dedupes across ticks, shards and bot restarts.
      const claimed = await this.ctx.redis
        .set(
          FIVEM_REDIS_KEYS.restartWarned(guild.id, `${restart.getTime()}:${minutes}`),
          '1',
          'EX',
          7200,
          'NX',
        )
        .catch(() => null);
      if (claimed !== 'OK') continue;
      const channel = await this.sendable(guild, config.alertsChannelId);
      if (!channel) return;
      const unix = Math.floor(restart.getTime() / 1000);
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.warning)
              .setTitle(`⏰ City restart in ${minutes} minute${minutes === 1 ? '' : 's'}`)
              .setDescription(
                `${config.serverName} restarts <t:${unix}:R> (<t:${unix}:t>). Find somewhere safe to park and log off.`,
              )
              .setFooter({ text: BRAND.footer })
              .setTimestamp(now),
          ],
        })
        .catch((err: unknown) =>
          this.ctx.logger.warn({ err, guildId: guild.id }, 'FiveM restart warning failed'),
        );
    }
  }
}
