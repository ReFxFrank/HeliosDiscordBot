import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Discord from 'next-auth/providers/discord';
import { fetchManageableGuilds, type ManageableGuild } from './lib/discord';

/** Scopes: identify (who you are) + guilds (list servers for the selector). */
const DISCORD_SCOPES = ['identify', 'guilds'].join(' ');

/** Re-derive the manageable-guild list at most this often (server-side check). */
const GUILD_REFRESH_MS = 60_000;

/** Refresh an expired Discord access token using the stored refresh token. */
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
    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    if (!response.ok) throw new Error('refresh failed');
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
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
      authorization: { params: { scope: DISCORD_SCOPES } },
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
        !next.error &&
        (!next.guildsFetchedAt || Date.now() - next.guildsFetchedAt > GUILD_REFRESH_MS)
      ) {
        next.guilds = await safeManageableGuilds(next.accessToken, next.guilds ?? []);
        next.guildsFetchedAt = Date.now();
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
