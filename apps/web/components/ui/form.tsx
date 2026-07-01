import type { ReactNode } from 'react';

export const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-[var(--color-brand)]/60';
export const monoInputClass = `${inputClass} font-mono`;

export type SaveStatus = 'idle' | 'saved' | 'error';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-white/80">{label}</span>
      {children}
      {hint && <span className="text-xs text-white/40">{hint}</span>}
    </label>
  );
}

export function SaveBar({
  pending,
  status,
  onSave,
  savedMessage = 'Saved — live on the bot.',
  label = 'Save changes',
}: {
  pending: boolean;
  status: SaveStatus;
  onSave: () => void;
  savedMessage?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85 disabled:opacity-50"
      >
        {pending ? 'Saving…' : label}
      </button>
      {status === 'saved' && (
        <span className="text-sm text-[var(--color-success)]">{savedMessage}</span>
      )}
      {status === 'error' && (
        <span className="text-sm text-[var(--color-danger)]">Could not save.</span>
      )}
    </div>
  );
}
