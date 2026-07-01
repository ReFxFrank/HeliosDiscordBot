'use client';

import { useState, useTransition } from 'react';
import type { BirthdaysConfig } from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveBirthdaysConfig } from '../lib/config-actions';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

export function BirthdaysForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: BirthdaysConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
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
      <Field label="Announcement channel" hint="Where daily birthday greetings post.">
        <ChannelSelect
          channels={channels}
          only="text"
          placeholder="None"
          selected={config.channelId ? [config.channelId] : []}
          onChange={(ids) => update('channelId', ids[0] ?? null)}
        />
      </Field>
      <Field
        label="Birthday role"
        hint="Granted on a member's birthday, removed the next day. Optional."
      >
        <RoleSelect
          roles={roles}
          placeholder="None"
          selected={config.roleId ? [config.roleId] : []}
          onChange={(ids) => update('roleId', ids[0] ?? null)}
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
