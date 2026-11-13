/** Shared bits of the dashboard's "connect the bot's Twitch account" flow. */

export const TWITCH_OAUTH_COOKIE = 'twitch_oauth';

/** The dashboard's public address (what Twitch redirects back to). */
export function dashboardBase(request: Request): string {
  const configured = process.env.AUTH_URL ?? process.env.DASHBOARD_URL;
  return (configured ?? new URL(request.url).origin).replace(/\/+$/, '');
}

export function twitchRedirectUri(request: Request): string {
  return `${dashboardBase(request)}/api/twitch/callback`;
}

export function twitchConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}
