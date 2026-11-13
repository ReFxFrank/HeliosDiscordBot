'use client';

import { useTransition, useState } from 'react';
import { TWITCH_ALERTS, type TwitchAlertKey, type TwitchChatConfig } from '@refx/shared';
import { saveTwitchSection } from '../../lib/twitch-chat-actions';
import { Field, SaveBar, type SaveStatus } from '../ui/form';
import { Switch } from '../ui/switch';
import { Badge, NumberInput, TemplateInput, ToggleRow } from './ui';

/** Alerts and their options save together (two sections, one Save). */
export function AlertsEditor({
  guildId,
  config,
  broadcasterConnected,
}: {
  guildId: string;
  config: TwitchChatConfig;
  broadcasterConnected: boolean;
}) {
  const [alerts, setAlerts] = useState(config.alerts);
  const [options, setOptions] = useState(config.alertOptions);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const touch = () => {
    setStatus('idle');
    setError(null);
  };
  const patch = (
    key: TwitchAlertKey,
    change: Partial<TwitchChatConfig['alerts'][TwitchAlertKey]>,
  ) => {
    setAlerts((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
    touch();
  };

  const save = () =>
    startTransition(async () => {
      const first = await saveTwitchSection(guildId, 'alerts', alerts);
      const second = first.ok ? await saveTwitchSection(guildId, 'alertOptions', options) : first;
      setError(second.ok ? null : (second.error ?? 'Could not save.'));
      setStatus(second.ok ? 'saved' : 'error');
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 md:grid-cols-3">
        <Field label="Smallest cheer thanked (bits)">
          <NumberInput
            value={options.minBits}
            min={1}
            max={1_000_000}
            onChange={(minBits) => {
              setOptions((o) => ({ ...o, minBits }));
              touch();
            }}
          />
        </Field>
        <Field label="Smallest raid announced (viewers)">
          <NumberInput
            value={options.minRaidViewers}
            min={0}
            max={1_000_000}
            onChange={(minRaidViewers) => {
              setOptions((o) => ({ ...o, minRaidViewers }));
              touch();
            }}
          />
        </Field>
        <ToggleRow
          title="Shout out raiders"
          description="Runs !so for whoever raids."
          checked={options.autoShoutoutRaids}
          onChange={(autoShoutoutRaids) => {
            setOptions((o) => ({ ...o, autoShoutoutRaids }));
            touch();
          }}
        />
      </div>

      {TWITCH_ALERTS.map((doc) => {
        const alert = alerts[doc.key];
        const needs = 'broadcaster' in doc && doc.broadcaster;
        return (
          <div key={doc.key} className="rounded-lg border border-white/10">
            <div className="flex items-center justify-between gap-4 px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm text-white/90">
                {doc.title}
                {needs && (
                  <Badge tone={broadcasterConnected ? 'purple' : 'warn'}>
                    {broadcasterConnected ? 'broadcaster connected' : 'needs broadcaster'}
                  </Badge>
                )}
              </p>
              <Switch
                checked={alert.enabled}
                onChange={(enabled) => patch(doc.key, { enabled })}
                label={doc.title}
              />
            </div>
            {alert.enabled && (
              <div className="border-t border-white/10 p-4">
                <TemplateInput
                  rows={2}
                  value={alert.message}
                  extraVariables={doc.vars}
                  onChange={(message) => patch(doc.key, { message })}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-col gap-2 pt-1">
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}
