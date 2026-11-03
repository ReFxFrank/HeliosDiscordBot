'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, RefreshCw, Send } from 'lucide-react';
import { refreshFivemPanel, type FivemActionResult } from '../lib/fivem-actions';
import { cn } from '../lib/utils';

/** Re-fetch the live status this often while the tab is visible. */
const AUTO_REFRESH_MS = 30_000;

/**
 * "Refresh panel" (edit the existing status message in place) and "Post new
 * panel" (send a fresh one) for the FiveM status panel, plus a quiet
 * auto-refresh of the status card they sit in.
 */
export function FivemPanelActions({ guildId }: { guildId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'refresh' | 'repost' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  function run(repost: boolean): void {
    if (repost && !window.confirm('Post a brand-new status panel message in the panel channel?')) {
      return;
    }
    setBusy(repost ? 'repost' : 'refresh');
    setMessage(null);
    startTransition(async () => {
      const result: FivemActionResult = await refreshFivemPanel(guildId, repost).catch(() => ({
        ok: false,
        error: 'Could not reach the dashboard server.',
      }));
      setBusy(null);
      // The bot edits/posts asynchronously, so "sent" is the honest outcome.
      setMessage(
        result.ok
          ? { ok: true, text: repost ? 'New panel requested.' : 'Refresh sent.' }
          : { ok: false, text: result.error ?? 'Could not send.' },
      );
      router.refresh();
    });
  }

  const button =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50';

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(false)}
          className={cn(
            button,
            'border border-white/10 text-white/75 hover:bg-white/[0.06] hover:text-white',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', busy === 'refresh' && 'animate-spin')} />
          Refresh panel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(true)}
          className={cn(
            button,
            'bg-[var(--color-brand-strong)] text-white hover:bg-[var(--color-brand-strong)]/85',
          )}
        >
          <Send className="h-4 w-4" />
          {busy === 'repost' ? 'Posting…' : 'Post new panel'}
        </button>
      </div>
      {message && (
        <span
          className={cn(
            'text-xs',
            message.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]',
          )}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}

/** Copy-to-clipboard chip (F8 connect string). */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy(): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
      })
      .catch(() => undefined);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy connect command"
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/85"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
