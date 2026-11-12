'use client';

import Link from 'next/link';
import { useStalePageReload } from '../../../lib/use-stale-page-reload';

/**
 * Error page for a server's dashboard. The usual cause is a page left open
 * across a dashboard update, which is reloaded automatically (see
 * `useStalePageReload`). If that didn't help, "Reload" does a full page load;
 * `reset()` alone would re-render the same stale code and fail again.
 */
export default function GuildError({ error }: { error: Error; reset: () => void }) {
  const reloading = useStalePageReload(error);
  if (reloading) {
    return (
      <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-8 text-center">
        <h2 className="text-lg font-semibold text-white/90">Updating the dashboard…</h2>
        <p className="mt-2 text-sm text-white/50">
          A new version was released while this page was open. Reloading to pick it up.
        </p>
      </div>
    );
  }
  return (
    <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-8 text-center">
      <h2 className="text-lg font-semibold text-white/90">This page needs a reload</h2>
      <p className="mt-2 text-sm text-white/50">
        The dashboard was probably updated while this page was open, or your access to this server
        changed. Reload to carry on. A role panel you were building is kept as a draft.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white"
        >
          Reload
        </button>
        <Link
          href="/servers"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70"
        >
          Back to servers
        </Link>
      </div>
    </div>
  );
}
