import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

/**
 * Twitch accounts this instance acts as (the chat bot's account), shared by
 * the dashboard (which connects them through OAuth) and the bot (which uses
 * and refreshes them). Tokens are stored AES-256-GCM encrypted with a key
 * derived from TWITCH_CLIENT_SECRET, so a database dump alone can't use them.
 */

export const TWITCH_BOT_ACCOUNT_ID = 'bot';

export interface TwitchAccountTokens {
  id: string;
  twitchUserId: string;
  login: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: Date;
  connectedBy: string;
  updatedAt: Date;
}

function key(): Buffer {
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!secret) throw new Error('TWITCH_CLIENT_SECRET is not set');
  return createHash('sha256').update(`twitch-account-tokens:${secret}`).digest();
}

export function encryptTwitchToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join(':');
}

export function decryptTwitchToken(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    // Wrong key (the client secret changed) or tampered: treat as disconnected.
    return null;
  }
}

export async function getTwitchAccount(
  db: PrismaClient,
  id: string,
): Promise<TwitchAccountTokens | null> {
  const row = await db.twitchAccount.findUnique({ where: { id } });
  if (!row) return null;
  const accessToken = decryptTwitchToken(row.accessToken);
  const refreshToken = decryptTwitchToken(row.refreshToken);
  if (!accessToken || !refreshToken) return null;
  return { ...row, accessToken, refreshToken };
}

export async function saveTwitchAccount(
  db: PrismaClient,
  account: Omit<TwitchAccountTokens, 'updatedAt'>,
): Promise<void> {
  const data = {
    twitchUserId: account.twitchUserId,
    login: account.login,
    displayName: account.displayName,
    accessToken: encryptTwitchToken(account.accessToken),
    refreshToken: encryptTwitchToken(account.refreshToken),
    scopes: account.scopes,
    expiresAt: account.expiresAt,
    connectedBy: account.connectedBy,
  };
  await db.twitchAccount.upsert({
    where: { id: account.id },
    create: { id: account.id, ...data },
    update: data,
  });
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string[];
}

/** Exchange or refresh at Twitch's token endpoint. */
export async function twitchTokenRequest(
  params: Record<string, string>,
): Promise<TokenResponse | { error: string }> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { error: 'Twitch app credentials are not set' };
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & {
      message?: string;
    };
    if (!res.ok || !json.access_token || !json.refresh_token) {
      return { error: json.message ?? `Twitch answered ${res.status}` };
    }
    return json as TokenResponse;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Twitch could not be reached' };
  }
}

const refreshing = new Map<string, Promise<TwitchAccountTokens | null>>();

/**
 * Refresh an account's tokens and store them. Returns null when Twitch refuses
 * (the account revoked access, or the password changed): it must be
 * reconnected on the dashboard. Concurrent callers share one refresh.
 */
export function refreshTwitchAccount(
  db: PrismaClient,
  id: string,
): Promise<TwitchAccountTokens | null> {
  const pending = refreshing.get(id);
  if (pending) return pending;
  const run = (async () => {
    const account = await getTwitchAccount(db, id);
    if (!account) return null;
    const result = await twitchTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    });
    if ('error' in result) return null;
    const next = {
      ...account,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      scopes: result.scope ?? account.scopes,
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
    };
    await saveTwitchAccount(db, next);
    return { ...next, updatedAt: new Date() };
  })().finally(() => refreshing.delete(id));
  refreshing.set(id, run);
  return run;
}

/** The account with an access token good for at least five more minutes. */
export async function freshTwitchAccount(
  db: PrismaClient,
  id: string,
): Promise<TwitchAccountTokens | null> {
  const account = await getTwitchAccount(db, id);
  if (!account) return null;
  if (account.expiresAt.getTime() - Date.now() > 5 * 60_000) return account;
  return refreshTwitchAccount(db, id);
}
