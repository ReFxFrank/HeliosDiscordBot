import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard for fetching user-supplied URLs (e.g. the welcome-card background).
 * The bot runs inside the private network, so a naive fetch of an operator- or
 * user-provided URL could reach internal services / cloud metadata. We only
 * allow http(s), resolve the host, and refuse if ANY resolved address is
 * private/reserved. Redirects are disabled so a public URL can't bounce to an
 * internal one.
 *
 * Residual risk: DNS rebinding (TOCTOU between resolve and connect). Acceptable
 * for cosmetic image fetching; a pinned-IP agent would close it fully.
 */

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // treat as unsafe
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  return false;
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

/** Fetch a user-supplied URL into a Buffer with SSRF protection. Throws on any violation. */
export async function safeFetchBuffer(rawUrl: string, opts: SafeFetchOptions = {}): Promise<Buffer> {
  const { maxBytes = 8 * 1024 * 1024, timeoutMs = 5000 } = opts;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http(s) URLs are allowed');
  }

  const host = url.hostname;
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((entry) => entry.address);
  if (addresses.length === 0) throw new Error('Host did not resolve');
  for (const address of addresses) {
    if (isPrivateAddress(address)) throw new Error('Refusing to fetch a private/reserved address');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Fetch failed (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error('Image exceeds size limit');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}
