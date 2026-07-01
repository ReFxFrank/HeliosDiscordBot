import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Symmetric secret encryption for values stored at rest (custom-bot tokens).
 * AES-256-GCM with a random 96-bit IV per message; the key is derived from
 * ENCRYPTION_KEY via SHA-256 so any key length ≥32 works. Output format is
 * `iv:tag:ciphertext`, all base64. Never log or return the plaintext.
 *
 * NOTE: keep this file byte-identical to apps/bot/src/lib/crypto.ts — the dashboard
 * encrypts and the bot decrypts, so they must agree on algorithm + derivation.
 */
function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_KEY must be set (≥32 chars) to encrypt secrets.');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
