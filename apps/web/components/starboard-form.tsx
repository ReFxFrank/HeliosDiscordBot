'use client';

import { useState, useTransition } from 'react';
import type { StarboardConfig } from '@solari/shared';
import type { ChannelOption } from '../lib/discord-guild';
import { saveStarboardConfig } from '../lib/config-actions';
import { ChannelSelect } from './ui/entity-select';
import { Switch } from './ui/switch';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

export function StarboardForm({
  guildId,
  initial,
  channels,
}: {
  guildId: string;
  initial: StarboardConfig;
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<StarboardConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof StarboardConfig>(key: K, value: StarboardConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveStarboardConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Starboard channel" hint="Where starred messages are posted.">
        <ChannelSelect
          channels={channels}
          only="text"
          placeholder="None"
          selected={config.channelId ? [config.channelId] : []}
          onChange={(ids) => update('channelId', ids[0] ?? null)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Emoji" hint="Unicode emoji or a custom emoji id.">
          <input
            className={inputClass}
            value={config.emoji}
            onChange={(e) => update('emoji', e.target.value || '⭐')}
          />
        </Field>
        <Field label="Threshold" hint="Stars required to reach the board.">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={config.threshold}
            onChange={(e) => update('threshold', Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      </div>

      <Field label="Ignored channels" hint="Channels to exclude from starboard.">
        <ChannelSelect
          channels={channels}
          multiple
          only="text"
          selected={config.ignoredChannelIds}
          onChange={(ids) => update('ignoredChannelIds', ids)}
        />
      </Field>

      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div>
          <p className="text-sm text-white/90">Count self-stars</p>
          <p className="text-xs text-white/50">Let authors star their own messages.</p>
        </div>
        <Switch
          checked={config.selfStar}
          onChange={(next) => update('selfStar', next)}
          label="Count self-stars"
        />
      </div>

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
