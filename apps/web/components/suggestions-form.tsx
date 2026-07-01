'use client';

import { useState, useTransition } from 'react';
import type { SuggestionsConfig } from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveSuggestionsConfig } from '../lib/config-actions';
import { Field, SaveBar, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';

export function SuggestionsForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: SuggestionsConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
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
      <Field label="Suggestion channel" hint="Where /suggest posts. Required.">
        <ChannelSelect
          channels={channels}
          only="text"
          placeholder="None"
          selected={config.channelId ? [config.channelId] : []}
          onChange={(ids) => update('channelId', ids[0] ?? null)}
        />
      </Field>
      <Field label="Staff roles" hint="May approve/deny (besides Manage Server).">
        <RoleSelect
          roles={roles}
          multiple
          selected={config.staffRoleIds}
          onChange={(ids) => update('staffRoleIds', ids)}
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
