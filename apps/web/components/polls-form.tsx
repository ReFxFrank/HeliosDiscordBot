'use client';

import { BRAND } from '@refx/shared';
import { useState, useTransition } from 'react';
import type { PollsConfig } from '@refx/shared';
import { savePollsConfig } from '../lib/config-actions';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

const HEX = /^#[0-9a-fA-F]{6}$/;

export function PollsForm({ guildId, initial }: { guildId: string; initial: PollsConfig }) {
  const [config, setConfig] = useState<PollsConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof PollsConfig>(key: K, value: PollsConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      let color = config.color.trim();
      if (color && !color.startsWith('#')) color = `#${color}`;
      const payload: PollsConfig = { ...config, color };
      const result = await savePollsConfig(guildId, payload);
      if (result.ok) setConfig(payload);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection title="Poll Appearance" description="How poll messages look on this server.">
        <div className="max-w-sm">
          <Field label="Embed color" hint="Applied to new polls.">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={HEX.test(config.color) ? config.color : BRAND.colorHex}
                onChange={(e) => update('color', e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
                aria-label="Poll embed color"
              />
              <input
                className={`${inputClass} font-mono`}
                value={config.color}
                maxLength={7}
                onChange={(e) => update('color', e.target.value)}
              />
            </div>
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Poll Defaults"
        description="Defaults applied when a poll is created with /poll."
      >
        <div className="max-w-sm">
          <Field
            label="Default auto-close (hours)"
            hint="Used when /poll runs without a duration. 0 keeps the poll open until closed manually."
          >
            <input
              type="number"
              min={0}
              max={336}
              className={inputClass}
              value={config.defaultDurationHours}
              onChange={(e) =>
                update(
                  'defaultDurationHours',
                  Math.max(0, Math.min(336, Math.round(Number(e.target.value) || 0))),
                )
              }
            />
          </Field>
        </div>
      </SettingsSection>

      <div className="pt-1">
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}
