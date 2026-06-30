'use client';

import { useState, useTransition } from 'react';
import type { SuggestionsConfig } from '@helios/shared';
import { saveSuggestionsConfig } from '../lib/config-actions';
import { Field, SaveBar, monoInputClass, type SaveStatus } from './ui/form';

const toList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function SuggestionsForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: SuggestionsConfig;
}) {
  const [config, setConfig] = useState<SuggestionsConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof SuggestionsConfig>(key: K, value: SuggestionsConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveSuggestionsConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Suggestion channel ID" hint="Where /suggest posts. Required.">
        <input
          className={monoInputClass}
          value={config.channelId ?? ''}
          onChange={(e) => update('channelId', e.target.value.trim() || null)}
          placeholder="channel ID"
        />
      </Field>
      <Field
        label="Staff role IDs"
        hint="Comma-separated. May approve/deny (besides Manage Server)."
      >
        <input
          className={monoInputClass}
          value={config.staffRoleIds.join(', ')}
          onChange={(e) => update('staffRoleIds', toList(e.target.value))}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={config.anonymous}
          onChange={(e) => update('anonymous', e.target.checked)}
        />
        Hide the author on the public suggestion
      </label>
      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
