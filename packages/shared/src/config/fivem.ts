import { z } from 'zod';

/**
 * FiveM module — ties the Discord to the ReFx city server. The bot polls the
 * server's own HTTP endpoints (`/info.json`, `/dynamic.json`, `/players.json`
 * on the game port) and drives:
 *
 *   - a self-updating status panel (replaces the txAdmin embed in #connect),
 *   - `/status` + `/players` and a "x/128 in the city" bot presence,
 *   - up/down alerts and scheduled-restart warnings,
 *   - the whitelist API the `refx_whitelist` resource calls on connect.
 */

const snowflake = z.string().regex(/^\d{17,20}$/);
/** 24h "HH:MM" wall-clock time, interpreted in `timezone`. */
export const restartTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h).');

export const fivemConfigSchema = z.object({
  /** Shown as the panel title and in alerts. */
  serverName: z.string().min(1).max(100).default('ReFx Roleplay'),
  /** Public IP or hostname of the FiveM server. Empty disables polling. */
  host: z.string().max(255).default(''),
  /** Game/HTTP port (FiveM serves its JSON endpoints on the game port). */
  port: z.number().int().min(1).max(65_535).default(30_120),
  /** What players type after `connect` in F8. Defaults to host:port when empty. */
  connectAddress: z.string().max(255).default(''),
  /** cfx.re join code (the part after cfx.re/join/). Enables the Connect button. */
  joinCode: z.string().max(32).default(''),
  /** How often the server is polled. */
  pollIntervalSeconds: z.number().int().min(30).max(600).default(60),

  /** Channel holding the live status panel (e.g. #connect). Null disables it. */
  panelChannelId: z.string().nullable().default(null),
  /** Optional banner image shown at the bottom of the panel. */
  panelImageUrl: z.string().url().or(z.literal('')).default(''),

  /** Show "x/y in the city" as the bot's presence. */
  presenceEnabled: z.boolean().default(true),
  /** Presence text. {players} {max} {server} are replaced. */
  presenceFormat: z.string().min(1).max(120).default('{players}/{max} in the city'),

  /** Where up/down + restart notices post (e.g. #server-status). Null disables. */
  alertsChannelId: z.string().nullable().default(null),
  /** Role pinged on up/down alerts. Null pings nobody. */
  alertsRoleId: z.string().nullable().default(null),
  /** Consecutive failed polls before the city is declared offline (avoids flapping). */
  offlineAfterFailures: z.number().int().min(1).max(10).default(2),

  /** Daily restart times (24h, in `timezone`). */
  restartTimes: z.array(restartTimeSchema).max(12).default([]),
  /** IANA timezone the restart times are in. */
  timezone: z.string().min(1).max(64).default('America/New_York'),
  /** Minutes before each restart to post a warning. */
  restartWarnMinutes: z.array(z.number().int().min(1).max(120)).max(6).default([30, 15, 5]),

  /** Gate connections behind Discord roles via the refx_whitelist resource. */
  whitelistEnabled: z.boolean().default(false),
  /** Member must hold at least one of these roles to connect. */
  whitelistRoleIds: z.array(snowflake).default([]),
  /** Shown in the FiveM connect screen when a player is refused. */
  whitelistDeniedMessage: z
    .string()
    .min(1)
    .max(500)
    .default(
      'You are not whitelisted for ReFx Roleplay. Join our Discord and get verified in #verify, then try again.',
    ),
});

export type FivemConfig = z.infer<typeof fivemConfigSchema>;

/** One connected player, as read from the server's /players.json. */
export interface FivemPlayer {
  /** In-game server id. */
  id: number;
  name: string;
  ping: number;
  /** Linked Discord user id, when the player has Discord running. */
  discordId: string | null;
}

/**
 * The last poll result. The bot writes it to Redis (`FIVEM_REDIS_KEYS.status`)
 * so the dashboard can show live status without talking to the game server.
 */
export interface FivemSnapshot {
  online: boolean;
  players: FivemPlayer[];
  maxPlayers: number;
  hostname: string;
  /** ISO time the city was first seen online in this up-streak, or null. */
  onlineSince: string | null;
  /** ISO time of this poll. */
  checkedAt: string;
}

/** Redis keys shared by the bot (writer) and the dashboard (reader). */
export const FIVEM_REDIS_KEYS = {
  status: (guildId: string) => `refx:fivem:status:${guildId}`,
  panelMessage: (guildId: string) => `refx:fivem:panel:${guildId}`,
  restartWarned: (guildId: string, key: string) => `refx:fivem:warned:${guildId}:${key}`,
} as const;

/** Leading `discord:` identifier on a FiveM player, as a bare user id. */
export function discordIdFromIdentifiers(identifiers: readonly string[]): string | null {
  const raw = identifiers.find((id) => id.startsWith('discord:'));
  const id = raw?.slice('discord:'.length) ?? '';
  return /^\d{17,20}$/.test(id) ? id : null;
}

/** The address shown after `connect` in the F8 console. */
export function fivemConnectAddress(config: Pick<FivemConfig, 'connectAddress' | 'host' | 'port'>) {
  if (config.connectAddress.trim()) return config.connectAddress.trim();
  if (!config.host.trim()) return '';
  return config.port === 30_120 ? config.host.trim() : `${config.host.trim()}:${config.port}`;
}

/** Wall-clock parts of `date` in an IANA timezone. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/**
 * The next scheduled restart strictly after `now`, or null when none are set.
 * Pure (timezone via Intl) so it's unit-testable; minute precision.
 */
export function nextRestart(
  config: Pick<FivemConfig, 'restartTimes' | 'timezone'>,
  now: Date,
): Date | null {
  if (config.restartTimes.length === 0) return null;
  let timeZone = config.timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    timeZone = 'UTC';
  }
  const local = zonedParts(now, timeZone);
  const nowMinutes = local.hour * 60 + local.minute;
  // Offset between the zone's wall clock and UTC at `now` (minute precision).
  const wallAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 60_000) * 60_000;

  let best: number | null = null;
  for (const time of config.restartTimes) {
    const [h, m] = time.split(':').map(Number) as [number, number];
    const target = h * 60 + m;
    const dayShift = target > nowMinutes ? 0 : 1;
    const wall = Date.UTC(local.year, local.month - 1, local.day + dayShift, h, m);
    const instant = wall - offsetMs;
    if (best === null || instant < best) best = instant;
  }
  return best === null ? null : new Date(best);
}
