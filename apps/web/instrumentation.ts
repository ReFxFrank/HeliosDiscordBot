import type { Instrumentation } from 'next';

/**
 * Server-side error tracking, dormant unless SENTRY_DSN is set in .env. Read
 * at runtime (not build), so enabling it is just an env change + restart.
 * Client-side capture is deliberately omitted — it would bake the DSN into the
 * build via NEXT_PUBLIC_ and server errors are what matter for the dashboard.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
