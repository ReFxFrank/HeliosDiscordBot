'use client';

import Link from 'next/link';

export default function GuildError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-8 text-center">
      <h2 className="text-lg font-semibold text-white/90">Something went wrong</h2>
      <p className="mt-2 text-sm text-white/50">
        We couldn’t load this server’s settings. This can happen if your access changed.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[var(--color-blurple)] px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
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
