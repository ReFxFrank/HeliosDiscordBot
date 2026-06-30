'use client';

import { useState, useTransition } from 'react';
import { saveGuildSettings, type GuildSettingsInput } from '../lib/config-actions';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-[var(--color-blurple)]/60';

export function SettingsForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: GuildSettingsInput;
}) {
  const [form, setForm] = useState<GuildSettingsInput>(initial);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  function update(key: keyof GuildSettingsInput, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveGuildSettings(guildId, form);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex max-w-md flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Locale</span>
        <input
          className={inputClass}
          value={form.locale}
          onChange={(e) => update('locale', e.target.value)}
          placeholder="en-US"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Timezone</span>
        <input
          className={inputClass}
          value={form.timezone}
          onChange={(e) => update('timezone', e.target.value)}
          placeholder="UTC"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Prefix</span>
        <input
          className={`${inputClass} font-mono`}
          value={form.prefix}
          onChange={(e) => update('prefix', e.target.value)}
          placeholder="!"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-[var(--color-blurple)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-blurple)]/85 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        {status === 'saved' && <span className="text-sm text-[var(--color-success)]">Saved.</span>}
        {status === 'error' && (
          <span className="text-sm text-[var(--color-danger)]">Could not save.</span>
        )}
      </div>
    </div>
  );
}
