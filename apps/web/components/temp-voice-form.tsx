'use client';

import { useState, useTransition } from 'react';
import type { TempVoiceConfig } from '@refx/shared';
import type { ChannelOption } from '../lib/discord-guild';
import { saveTempVoiceConfig } from '../lib/config-actions';
import { ChannelSelect } from './ui/entity-select';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

export function TempVoiceForm({
  guildId,
  initial,
  channels,
}: {
  guildId: string;
  initial: TempVoiceConfig;
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<TempVoiceConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof TempVoiceConfig>(key: K, value: TempVoiceConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveTempVoiceConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Hub channels" hint="Joining one of these voice channels creates a temp channel.">
        <ChannelSelect
          channels={channels}
          only="voice"
          multiple
          placeholder="Add hub voice channels…"
          selected={config.hubChannelIds}
          onChange={(ids) => update('hubChannelIds', ids)}
        />
      </Field>

      <Field label="Category" hint="Where temp channels are created (defaults to the hub's category).">
        <ChannelSelect
          channels={channels}
          only="category"
          placeholder="Same as hub"
          selected={config.categoryId ? [config.categoryId] : []}
          onChange={(ids) => update('categoryId', ids[0] ?? null)}
        />
      </Field>

      <Field label="Channel name template" hint="Name for created channels. {user} = the owner's name.">
        <input
          className={inputClass}
          maxLength={100}
          value={config.nameTemplate}
          onChange={(e) => update('nameTemplate', e.target.value)}
        />
      </Field>

      <Field label="Default user limit" hint="User cap on new temp channels (0 = unlimited, max 99).">
        <input
          type="number"
          min={0}
          max={99}
          className={inputClass}
          value={config.defaultUserLimit}
          onChange={(e) =>
            update('defaultUserLimit', Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))))
          }
        />
      </Field>

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
