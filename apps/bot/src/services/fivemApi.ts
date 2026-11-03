import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Guild, GuildMember } from 'discord.js';
import { env } from '../env';
import { readSnapshot } from '../modules/fivem';
import type { BotContext } from '../framework/context';

/**
 * Whitelist API for the `refx_whitelist` FiveM resource. During
 * `playerConnecting` the resource asks
 *
 *   GET /whitelist/<discordUserId>      Authorization: Bearer <FIVEM_API_KEY>
 *
 * and gets `{ allowed, reason, message?, name? }`. The answer comes from the
 * member cache (falling back to one REST fetch), so the bot token never sits on
 * the game server and checks are near-instant. `GET /status` returns the last
 * poll snapshot and `GET /health` is unauthenticated for uptime checks.
 *
 * Only shard 0 listens (a single-community bot runs one shard), and only when
 * FIVEM_API_KEY is set.
 */

type WhitelistReason =
  'whitelist_disabled' | 'allowed' | 'not_member' | 'missing_role' | 'not_configured';

interface WhitelistResult {
  allowed: boolean;
  reason: WhitelistReason;
  message?: string;
  name?: string;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time bearer check (hashing first equalises the lengths). */
function authorized(req: IncomingMessage, key: string): boolean {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  return token.length > 0 && timingSafeEqual(sha256(token), sha256(key));
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** The guild whose roles gate the city: REFX_GUILD_ID, else the first with the whitelist on. */
async function resolveGuild(ctx: Omit<BotContext, 'fivem'>): Promise<Guild | null> {
  if (env.REFX_GUILD_ID) return ctx.client.guilds.cache.get(env.REFX_GUILD_ID) ?? null;
  for (const guild of ctx.client.guilds.cache.values()) {
    if (!(await ctx.config.isEnabled(guild.id, 'FIVEM'))) continue;
    const config = await ctx.config.getConfig(guild.id, 'FIVEM');
    if (config.whitelistEnabled) return guild;
  }
  return null;
}

export async function checkWhitelist(
  ctx: Omit<BotContext, 'fivem'>,
  guild: Guild,
  userId: string,
): Promise<WhitelistResult> {
  const enabled = await ctx.config.isEnabled(guild.id, 'FIVEM');
  const config = await ctx.config.getConfig(guild.id, 'FIVEM');
  if (!enabled || !config.whitelistEnabled) return { allowed: true, reason: 'whitelist_disabled' };
  if (config.whitelistRoleIds.length === 0) {
    // Fail closed: an enabled whitelist with no roles would otherwise admit everyone.
    return { allowed: false, reason: 'not_configured', message: config.whitelistDeniedMessage };
  }

  let member: GuildMember | null = guild.members.cache.get(userId) ?? null;
  if (!member) member = await guild.members.fetch(userId).catch(() => null);
  if (!member)
    return { allowed: false, reason: 'not_member', message: config.whitelistDeniedMessage };

  const allowed = config.whitelistRoleIds.some((roleId) => member.roles.cache.has(roleId));
  return allowed
    ? { allowed: true, reason: 'allowed', name: member.displayName }
    : {
        allowed: false,
        reason: 'missing_role',
        message: config.whitelistDeniedMessage,
        name: member.displayName,
      };
}

/** Start the API. Returns a stopper, or null when disabled. */
export function startFivemApi(
  ctx: Omit<BotContext, 'fivem'>,
  shardId: number,
): (() => Promise<void>) | null {
  const key = env.FIVEM_API_KEY;
  if (!key || shardId !== 0) return null;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (!authorized(req, key)) return send(res, 401, { error: 'unauthorized' });

    void (async () => {
      const guild = await resolveGuild(ctx);
      const whitelist = url.pathname.match(/^\/whitelist\/(\d{17,20})$/);
      if (whitelist?.[1]) {
        if (!guild) return send(res, 200, { allowed: true, reason: 'whitelist_disabled' });
        return send(res, 200, await checkWhitelist(ctx, guild, whitelist[1]));
      }
      if (url.pathname === '/status') {
        if (!guild) return send(res, 404, { error: 'no_guild' });
        return send(res, 200, (await readSnapshot(ctx, guild.id)) ?? { online: false });
      }
      return send(res, 404, { error: 'not_found' });
    })().catch((err: unknown) => {
      ctx.logger.error({ err, path: url.pathname }, 'FiveM API request failed');
      if (!res.headersSent) send(res, 500, { error: 'internal' });
    });
  });

  server.on('error', (err) =>
    ctx.logger.error({ err, port: env.FIVEM_API_PORT }, 'FiveM API server error'),
  );
  server.listen(env.FIVEM_API_PORT, env.FIVEM_API_HOST, () =>
    ctx.logger.info(
      { host: env.FIVEM_API_HOST, port: env.FIVEM_API_PORT },
      'FiveM whitelist API listening',
    ),
  );

  return () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
}
