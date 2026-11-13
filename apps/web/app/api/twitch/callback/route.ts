import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  TWITCH_BOT_ACCOUNT_ID,
  prisma,
  saveTwitchAccount,
  twitchTokenRequest,
} from '@refx/database';
import { TWITCH_BOT_SCOPES, TWITCH_BROADCASTER_SCOPES, twitchChatConfigSchema } from '@refx/shared';
import { assertCanManage, requireSession } from '../../../../lib/auth-guards';
import { writeAuditLog } from '../../../../lib/audit';
import { publishConfigUpdate } from '../../../../lib/redis';
import {
  TWITCH_OAUTH_COOKIE,
  dashboardBase,
  twitchRedirectUri,
} from '../../../../lib/twitch-oauth';

export const dynamic = 'force-dynamic';

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Twitch sends the manager back here after they approve (or cancel). */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const jar = await cookies();
  const [expected = '', guildId = '', rawRole = 'bot'] = (
    jar.get(TWITCH_OAUTH_COOKIE)?.value ?? ''
  ).split('.');
  const role = rawRole === 'broadcaster' ? 'broadcaster' : 'bot';
  const base = dashboardBase(request);
  const back = (result: string) => {
    const response = NextResponse.redirect(
      guildId ? `${base}/servers/${guildId}/twitch?twitch=${role}-${result}` : `${base}/`,
    );
    response.cookies.set(TWITCH_OAUTH_COOKIE, '', { path: '/api/twitch', maxAge: 0 });
    return response;
  };

  const state = url.searchParams.get('state') ?? '';
  if (!expected || !guildId || !sameState(state, expected)) return back('expired');
  if (url.searchParams.get('error')) return back('cancelled');

  let userId: string;
  try {
    const session = await requireSession();
    await assertCanManage(session, guildId);
    userId = session.user.id;
  } catch {
    return back('forbidden');
  }

  const code = url.searchParams.get('code') ?? '';
  const tokens = await twitchTokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: twitchRedirectUri(request),
  });
  if ('error' in tokens) return back('failed');

  const granted = new Set(tokens.scope ?? []);
  const required = role === 'bot' ? TWITCH_BOT_SCOPES : TWITCH_BROADCASTER_SCOPES;
  if (!required.every((scope) => granted.has(scope))) return back('missing-scopes');

  let user: { id: string; login: string; display_name: string } | undefined;
  try {
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID ?? '',
        Authorization: `Bearer ${tokens.access_token}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { data?: (typeof user)[] };
    user = json.data?.[0];
  } catch {
    user = undefined;
  }
  if (!user) return back('failed');

  if (role === 'broadcaster') {
    // Only the channel the bot serves may connect as its broadcaster.
    const row = await prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId, module: 'TWITCH_CHAT' } },
      select: { config: true },
    });
    const channel = twitchChatConfigSchema.parse(row?.config ?? {}).channel;
    if (!channel || channel !== user.login.toLowerCase()) return back('wrong-account');
  }

  await saveTwitchAccount(prisma, {
    id: role === 'bot' ? TWITCH_BOT_ACCOUNT_ID : `broadcaster:${user.id}`,
    twitchUserId: user.id,
    login: user.login,
    displayName: user.display_name,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scopes: [...granted],
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    connectedBy: userId,
  });
  await writeAuditLog({
    guildId,
    userId,
    action: `twitch.${role}.connect`,
    module: 'TWITCH_CHAT',
    after: { login: user.login },
  }).catch(() => undefined);
  // The bot re-reads the accounts and (re)joins.
  await publishConfigUpdate(guildId, 'TWITCH_CHAT').catch(() => undefined);
  return back('connected');
}
