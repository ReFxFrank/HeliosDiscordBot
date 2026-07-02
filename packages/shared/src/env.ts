import { z } from 'zod';

/**
 * Zod-validated environment loader. Each process composes the base schema with
 * its own required variables and calls `parseEnv` at startup so a misconfigured
 * deployment fails fast with a readable error instead of `undefined` surprises.
 */

const csvToArray = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
});

export const botEnvSchema = baseEnvSchema.extend({
  DISCORD_TOKEN: z.string().min(1),
  /** Sentry error tracking — leave unset to disable entirely. */
  SENTRY_DSN: z.string().url().optional(),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  /** Comma-separated list of bot-owner Discord user IDs. */
  OWNER_IDS: z.string().default('').transform(csvToArray),
  /** Guild to register commands into for instant dev iteration. */
  DEV_GUILD_ID: z.string().optional(),
  /** Turn on the Lavalink-backed Music module (premium). Requires a running
   *  Lavalink node — start it with the `music` docker-compose profile. */
  MUSIC_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  LAVALINK_HOST: z.string().default('localhost'),
  LAVALINK_PORT: z.coerce.number().int().positive().default(2333),
  LAVALINK_PASSWORD: z.string().default('youshallnotpass'),
  /** 32+ byte key used to encrypt third-party tokens at rest (§10). */
  ENCRYPTION_KEY: z.string().min(32).optional(),
  /** Expose a Prometheus /metrics + /health HTTP server per shard. */
  METRICS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  /** Base metrics port; each shard binds METRICS_PORT + shardId. */
  METRICS_PORT: z.coerce.number().int().positive().default(9090),
  /** Twitch app credentials for Social Alerts live notifications (optional —
   *  YouTube/Reddit/RSS work without any keys). */
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),
  /** Public ReFx status feed override (optional; defaults to api.refx.gg). */
  REFX_STATUS_URL: z.string().url().optional(),
  /** status:read bearer token for the authenticated node-metrics feed. */
  REFX_STATUS_TOKEN: z.string().optional(),
  /** Authenticated node-metrics endpoint override (optional). */
  REFX_NODES_URL: z.string().url().optional(),
});

export const webEnvSchema = baseEnvSchema.extend({
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  OWNER_IDS: z.string().default('').transform(csvToArray),
  /** Shared HMAC secret for the inbound ReFx webhook. Unset => receiver
   *  returns 503 (fails closed). Must match the ReFx backend's value. */
  REFX_WEBHOOK_SECRET: z.string().min(16).optional(),
  /** Stripe premium billing (§3). All optional — unset disables the upgrade
   *  flow and the dashboard shows "billing not configured". */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** The recurring Price the per-server Premium subscription checks out against. */
  STRIPE_PREMIUM_PRICE_ID: z.string().optional(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type BotEnv = z.infer<typeof botEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

/** Parse a process environment against a schema, throwing a readable error. */
export function parseEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: Record<string, string | undefined> = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
