'use client';

import Link from 'next/link';
import { useStalePageReload } from '../../lib/use-stale-page-reload';

export default function ServersError({ error, reset }: { error: Error; reset: () => void }) {
  // A page left open across a dashboard update: one reload fixes it.
  const reloading = useStalePageReload(error);
  if (reloading) return null;
  return (
    <main className="mx-auto mt-16 max-w-md px-6">
      <div className="glass rounded-2xl p-8 text-center">
        <h2 className="text-lg font-semibold text-white/90">Couldn’t load your servers</h2>
        <p className="mt-2 text-sm text-white/50">
          We hit a problem talking to Discord or the database. Please try again.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
          <Link
            href="/servers"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70"
          >
            Your servers
          </Link>
        </div>
      </div>
    </main>
  );
}
