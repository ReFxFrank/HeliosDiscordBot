import * as Sentry from '@sentry/node';
import { env } from '../env';

/**
 * Error tracking, dormant unless SENTRY_DSN is set in .env. Sentry's default
 * integrations also capture uncaught exceptions / unhandled rejections once
 * initialised, so crashes reach the dashboard even without an explicit call.
 */
export const sentryEnabled = Boolean(env.SENTRY_DSN);

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Errors only — no performance tracing volume on a busy bot.
    tracesSampleRate: 0,
  });
}

/** Report an already-logged error; no-op when Sentry is disabled. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
