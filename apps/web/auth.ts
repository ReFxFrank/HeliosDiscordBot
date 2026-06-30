import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Discord from 'next-auth/providers/discord';

/** Scopes: identify (who you are) + guilds (list servers for the selector). */
const DISCORD_SCOPES = ['identify', 'guilds'].join(' ');

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
    jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.discordId = account.providerAccountId;
        return token;
      }
      // Still valid (with a 60s safety margin)?
      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - 60_000) {
        return token;
      }
      return refreshAccessToken(token);
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.discordId ?? '';
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
