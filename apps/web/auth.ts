import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Discord from 'next-auth/providers/discord';
import { fetchManageableGuilds, type ManageableGuild } from './lib/discord';

/** Scopes: identify (who you are) + guilds (list servers for the selector). */
const DISCORD_SCOPES = ['identify', 'guilds'].join(' ');

/** Re-derive the manageable-guild list at most this often (server-side check). */
const GUILD_REFRESH_MS = 60_000;

/**
 * Refresh an expired Discord access token using the stored refresh token.
 * Distinguishes a DEFINITIVE rejection (400/401 — grant revoked, or the rotated
 * refresh token was already spent by a concurrent request) from a TRANSIENT
 * failure (network blip, 429, 5xx). Only the former means the user's access
 * truly ended; a transient error must not nuke their session state — that was
 * surfacing as "clicking a server does nothing" (guard saw an empty guild list
 * and silently bounced back to /servers).
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken ?? '',
      }),
    });
    if (response.status === 400 || response.status === 401) {
      return { ...token, error: 'RefreshAccessTokenError' };
    }
    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    if (!response.ok) throw new Error(`refresh failed (${response.status})`);
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      error: undefined,
    };
  } catch {
    // Transient — keep the current tokens and retry on the next request (we
    // refresh 60s ahead of expiry, so the old access token usually still works).
    return { ...token, error: 'RefreshTransientError' };
  }
}

/** Fetch manageable guilds, falling back to the last known list on a blip. */
async function safeManageableGuilds(
  accessToken: string,
  fallback: ManageableGuild[],
): Promise<ManageableGuild[]> {
  try {
    return await fetchManageableGuilds(accessToken);
  } catch {
    return fallback;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      // Must include the full `url`, not just `params`: Auth.js REPLACES the
      // provider's default `authorization` when you pass an object, and Discord
      // has no OIDC `issuer` for the discovery fallback — so omitting `url`
      // makes signIn throw `TypeError: Invalid URL`.
      authorization: {
        url: 'https://discord.com/api/oauth2/authorize',
        params: { scope: DISCORD_SCOPES },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in: capture tokens + the first manageable-guild list.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.discordId = account.providerAccountId;
        token.guilds = await safeManageableGuilds(account.access_token ?? '', []);
        token.guildsFetchedAt = Date.now();
        return token;
      }

      // Refresh the access token shortly before it expires.
      let next = token;
      if (!next.expiresAt || Date.now() >= next.expiresAt * 1000 - 60_000) {
        next = await refreshAccessToken(next);
      }

      // Re-derive the manageable-guild list server-side at most every 60s. The
      // list lives only in the encrypted, httpOnly JWT — the access token is
      // never exposed to the client (it stays on the JWT, off the session).
      if (
        next.accessToken &&
        next.error !== 'RefreshAccessTokenError' &&
        (!next.guildsFetchedAt || Date.now() - next.guildsFetchedAt > GUILD_REFRESH_MS)
      ) {
        next.guilds = await safeManageableGuilds(next.accessToken, next.guilds ?? []);
        next.guildsFetchedAt = Date.now();
      } else if (next.error === 'RefreshAccessTokenError') {
        // Discord DEFINITIVELY rejected the grant → we can no longer trust the
        // cached manageable-guild list (a user who lost Manage Server would
        // otherwise keep dashboard access). Fail closed: drop the list so every
        // assertCanManage rejects until they re-authenticate. Transient refresh
        // errors deliberately do NOT land here — the last verified list (≤60s
        // old) stays authoritative through a blip.
        next.guilds = [];
      }
      return next;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.discordId ?? '';
      // Only non-secret data is exposed on the client session.
      session.guilds = token.guilds ?? [];
      session.error = token.error;
      return session;
    },
  },
});
