import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The secret in a server's song-request overlay and queue links. Derived from
 * the instance's secret, so it never needs storing and only someone with the
 * link can drive the player.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.TWITCH_CLIENT_SECRET;
  if (!value) throw new Error('AUTH_SECRET is not set');
  return value;
}

export function twitchSongToken(guildId: string, purpose: 'player' | 'queue'): string {
  return createHmac('sha256', secret())
    .update(`twitch-songs:${purpose}:${guildId}`)
    .digest('base64url')
    .slice(0, 32);
}

/** Guild id + token as one link segment: "<guildId>-<token>". */
export function twitchSongKey(guildId: string, purpose: 'player' | 'queue'): string {
  return `${guildId}-${twitchSongToken(guildId, purpose)}`;
}

/** The guild a link segment unlocks, or null when the token is wrong. */
export function verifyTwitchSongKey(key: string, purpose: 'player' | 'queue'): string | null {
  const match = key.match(/^(\d{17,20})-([\w-]{32})$/);
  if (!match?.[1] || !match[2]) return null;
  const expected = Buffer.from(twitchSongToken(match[1], purpose));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? match[1] : null;
}
