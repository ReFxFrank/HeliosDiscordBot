import { beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-at-least-32-characters!!';
});

describe('crypto (AES-256-GCM secret storage)', () => {
  it('round-trips a secret and never stores the plaintext', () => {
    const secret = 'MTA5.super.secret.bot.token-value';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(enc.split(':')).toHaveLength(3); // iv:tag:ciphertext
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('uses a fresh IV so the same input encrypts differently each time', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('rejects tampered ciphertext (auth tag mismatch)', () => {
    const [iv, tag] = encryptSecret('hello').split(':');
    const tampered = `${iv}:${tag}:${Buffer.from('tampered').toString('base64')}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
