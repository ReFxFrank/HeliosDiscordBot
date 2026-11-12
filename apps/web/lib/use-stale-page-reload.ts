'use client';

import { useEffect, useState } from 'react';

const RELOAD_MARK = 'dashboard-auto-reload';
/** A second failure this soon after reloading is a real fault, not a stale page. */
const RELOAD_COOLDOWN_MS = 60_000;

function shouldReload(error: Error & { digest?: string }): boolean {
  if (typeof window === 'undefined') return false;
  // A digest marks an error raised on the server; reloading would not change it.
  if (error.digest) return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARK) ?? 0);
    return Date.now() - last > RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * For error pages. A page left open across a dashboard update still has the old
 * build's code, so the first response from the new build (after pressing any
 * button) can fail to render even though the button's action went through. One
 * full reload fixes that, so do it for the admin instead of showing an error.
 *
 * Returns true while that reload is under way, so the page can show a short
 * "updating" note rather than the error. Reloads at most once a minute, so a
 * genuine fault still ends on the error page.
 */
export function useStalePageReload(error: Error & { digest?: string }): boolean {
  const [reloading] = useState(() => shouldReload(error));
  useEffect(() => {
    if (!reloading) return;
    try {
      window.sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
    } catch {
      // No session storage: reload anyway; without the mark we just can't rate-limit.
    }
    window.location.reload();
  }, [reloading]);
  return reloading;
}
