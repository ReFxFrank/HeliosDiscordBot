'use client';

import { useState, useTransition } from 'react';
import type { BirthdaysConfig } from '@helios/shared';
import { saveBirthdaysConfig } from '../lib/config-actions';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

export function BirthdaysForm({ guildId, initial }: { guildId: string; initial: BirthdaysConfig }) {
  const [config, setConfig] = useState<BirthdaysConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof BirthdaysConfig>(key: K, value: BirthdaysConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveBirthdaysConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Announcement channel ID" hint="Where daily birthday greetings post.">
        <input
          className={monoInputClass}
          value={config.channelId ?? ''}
          onChange={(e) => update('channelId', e.target.value.trim() || null)}
          placeholder="channel ID"
        />
      </Field>
      <Field
        label="Birthday role ID"
        hint="Granted on a member's birthday, removed the next day. Optional."
      >
        <input
          className={monoInputClass}
          value={config.roleId ?? ''}
          onChange={(e) => update('roleId', e.target.value.trim() || null)}
          placeholder="optional"
        />
      </Field>
      <Field label="Message" hint="Supports {user}, {server}.">
        <textarea
          className={`${inputClass} min-h-16 resize-y`}
          value={config.message}
          onChange={(e) => update('message', e.target.value)}
          maxLength={1500}
        />
      </Field>
      <Field label="Announce hour (UTC)" hint="0–23. The daily check runs at this UTC hour.">
        <input
          type="number"
          min={0}
          max={23}
          className={inputClass}
          value={config.announceHourUtc}
          onChange={(e) =>
            update('announceHourUtc', Math.min(23, Math.max(0, Number(e.target.value) || 0)))
          }
        />
      </Field>
      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
