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
  /** Bot status line ("Watching …"). Defaults to the community name. */
  BRAND_PRESENCE: z.string().max(120).optional(),
  /** Public dashboard URL, for the bot's link buttons. Unset hides them. */
  DASHBOARD_URL: z.string().url().optional(),
  /** FiveM whitelist API (refx_whitelist resource). Unset disables the API. */
  FIVEM_API_KEY: z.string().min(24).optional(),
  /** Port the whitelist API listens on. */
  FIVEM_API_PORT: z.coerce.number().int().positive().default(30125),
  /** Interface the whitelist API binds to. */
  FIVEM_API_HOST: z.string().default('0.0.0.0'),
  /** The ReFx guild the whitelist checks roles in (defaults to the first guild with the whitelist on). */
  REFX_GUILD_ID: z.string().optional(),
  /** Invite URL of the official support server (adds a /help button when set). */
  SUPPORT_SERVER_INVITE: z.string().url().optional(),
});

export const webEnvSchema = baseEnvSchema.extend({
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  OWNER_IDS: z.string().default('').transform(csvToArray),
  /** Invite URL of the official support server (adds a footer link when set). */
  SUPPORT_SERVER_INVITE: z.string().url().optional(),
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
