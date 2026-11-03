import { DISCORD_LIMITS } from '@refx/shared';

const SEPARATOR = ':';

export interface ParsedCustomId {
  module: string;
  action: string;
  args: string[];
}

/**
 * Build a routed component custom id (`module:action:arg...`). Discord caps
 * custom ids at 100 chars (flag), so anything stateful must store its state in
 * Redis/DB and pass only a short key here — this throws if the limit is hit so
 * the mistake surfaces in development, not in production.
 */
export function buildCustomId(module: string, action: string, ...args: string[]): string {
  const id = [module, action, ...args].join(SEPARATOR);
  if (id.length > DISCORD_LIMITS.customIdMaxLength) {
    throw new Error(
      `Custom id "${id}" exceeds ${DISCORD_LIMITS.customIdMaxLength} chars. ` +
        'Store state in Redis/DB and reference it by a short key.',
    );
  }
  return id;
}

export function parseCustomId(raw: string): ParsedCustomId {
  const [module = '', action = '', ...args] = raw.split(SEPARATOR);
  return { module, action, args };
}
