import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { TWITCH_BOT_SCOPES, TWITCH_BROADCASTER_SCOPES } from '@refx/shared';
import { assertCanManage, requireSession } from '../../../../lib/auth-guards';
import {
  TWITCH_OAUTH_COOKIE,
  dashboardBase,
  twitchConfigured,
  twitchRedirectUri,
} from '../../../../lib/twitch-oauth';

export const dynamic = 'force-dynamic';

/**
 * Start connecting a Twitch account: the bot's own account (`role=bot`) or
 * the streamer's (`role=broadcaster`, for sub/bits/hype alerts and
 * !settitle). `force_verify` makes Twitch show which account is signing in.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const guildId = params.get('guild') ?? '';
  const role = params.get('role') === 'broadcaster' ? 'broadcaster' : 'bot';
  const back = `${dashboardBase(request)}/servers/${guildId}/twitch`;
  if (!/^\d{17,20}$/.test(guildId)) return new Response('Missing server', { status: 400 });
  try {
    const session = await requireSession();
    await assertCanManage(session, guildId);
  } catch {
    return NextResponse.redirect(`${dashboardBase(request)}/`);
  }
  if (!twitchConfigured()) return NextResponse.redirect(`${back}?twitch=${role}-not-configured`);

  const state = randomBytes(24).toString('hex');
  const authorize = new URL('https://id.twitch.tv/oauth2/authorize');
  authorize.search = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? '',
    redirect_uri: twitchRedirectUri(request),
    response_type: 'code',
    scope: (role === 'bot' ? TWITCH_BOT_SCOPES : TWITCH_BROADCASTER_SCOPES).join(' '),
    state,
    force_verify: 'true',
  }).toString();

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set(TWITCH_OAUTH_COOKIE, `${state}.${guildId}.${role}`, {
    httpOnly: true,
    secure: dashboardBase(request).startsWith('https://'),
    sameSite: 'lax',
    path: '/api/twitch',
    maxAge: 600,
  });
  return response;
}
