'use client';

import { useState, useTransition } from 'react';
import type { LoggingConfig } from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveLoggingConfig } from '../lib/config-actions';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { Field, SaveBar, monoInputClass, type SaveStatus } from './ui/form';

const toList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function LoggingForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: LoggingConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<LoggingConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof LoggingConfig>(key: K, value: LoggingConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveLoggingConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  const channelField = (
    label: string,
    key: 'messageChannelId' | 'memberChannelId' | 'serverChannelId' | 'voiceChannelId',
  ) => (
    <Field label={label} hint="Blank to disable this category.">
      <ChannelSelect
        channels={channels}
        only="text"
        placeholder="None"
        selected={config[key] ? [config[key] as string] : []}
        onChange={(ids) => update(key, ids[0] ?? null)}
      />
    </Field>
  );

  return (
    <div className="flex flex-col gap-5">
      {channelField('Message log channel', 'messageChannelId')}
      {channelField('Member log channel', 'memberChannelId')}
      {channelField('Server log channel', 'serverChannelId')}
      {channelField('Voice log channel', 'voiceChannelId')}

      <Field label="Ignored channels" hint="Channels to skip.">
        <ChannelSelect
          channels={channels}
          multiple
          only="text"
          selected={config.ignoredChannelIds}
          onChange={(ids) => update('ignoredChannelIds', ids)}
        />
      </Field>
      <Field label="Ignored roles" hint="Events from members with these roles are skipped.">
        <RoleSelect
          roles={roles}
          multiple
          selected={config.ignoredRoleIds}
          onChange={(ids) => update('ignoredRoleIds', ids)}
        />
      </Field>
      <Field label="Ignored users" hint="Comma-separated user IDs to skip.">
        <input
          className={monoInputClass}
          value={config.ignoredUserIds.join(', ')}
          onChange={(e) => update('ignoredUserIds', toList(e.target.value))}
        />
      </Field>

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
