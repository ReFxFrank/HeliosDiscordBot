import 'next-auth';
import 'next-auth/jwt';

interface ManageableGuildToken {
  id: string;
  name: string;
  icon: string | null;
}

declare module 'next-auth' {
  interface Session {
    /** Non-secret list of guilds the user can manage (server-derived). */
    guilds?: ManageableGuildToken[];
    error?: string;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** Discord OAuth tokens — kept on the JWT only, never exposed to clients. */
    accessToken?: string;
    refreshToken?: string;
    /** Unix seconds when the access token expires. */
    expiresAt?: number;
    discordId?: string;
    error?: string;
    /** Cached manageable-guild list + when it was last derived. */
    guilds?: ManageableGuildToken[];
    guildsFetchedAt?: number;
  }
}
