'use client';

import { useState, useTransition } from 'react';
import {
  REFX_SEVERITIES,
  REFX_WEBHOOK_EVENTS,
  type RefxAlertsConfig,
  type RefxSeverity,
  type RefxWebhookEvent,
} from '@helios/shared';
import { saveRefxAlertsConfig } from '../lib/config-actions';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

const toList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const EVENT_LABELS: Record<RefxWebhookEvent, string> = {
  'incident.created': 'Incident opened',
  'incident.updated': 'Incident updated',
  'incident.resolved': 'Incident resolved',
  'component.status_changed': 'Component status change',
};

function severityValue(value: RefxSeverity | null): string {
  return value ?? '';
}

export function RefxAlertsForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: RefxAlertsConfig;
}) {
  const [config, setConfig] = useState<RefxAlertsConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof RefxAlertsConfig>(key: K, value: RefxAlertsConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function toggleEvent(event: RefxWebhookEvent, on: boolean): void {
    const set = new Set(config.events);
    if (on) set.add(event);
    else set.delete(event);
    update('events', [...set]);
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveRefxAlertsConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Alert channel ID" hint="Where ReFx incident & status alerts are posted.">
        <input
          className={monoInputClass}
          value={config.channelId ?? ''}
          onChange={(e) => update('channelId', e.target.value.trim() || null)}
          placeholder="channel ID"
        />
      </Field>

      <Field label="Events" hint="Which kinds of updates to post.">
        <div className="flex flex-col gap-1.5">
          {REFX_WEBHOOK_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={config.events.includes(event)}
                onChange={(e) => toggleEvent(event, e.target.checked)}
              />
              {EVENT_LABELS[event]}
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Region filter"
        hint="Comma-separated region codes (e.g. ca-east). Blank = all regions."
      >
        <input
          className={monoInputClass}
          value={config.regionFilter.join(', ')}
          onChange={(e) => update('regionFilter', toList(e.target.value))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum severity" hint="Only post incidents at/above this level.">
          <select
            className={inputClass}
            value={severityValue(config.minSeverity)}
            onChange={(e) =>
              update('minSeverity', e.target.value ? (e.target.value as RefxSeverity) : null)
            }
          >
            <option value="" className="bg-[var(--color-base-elevated)]">
              Any
            </option>
            {REFX_SEVERITIES.map((sev) => (
              <option key={sev} value={sev} className="bg-[var(--color-base-elevated)]">
                {sev}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mention severity" hint="Ping the role at/above this level.">
          <select
            className={inputClass}
            value={severityValue(config.mentionMinSeverity)}
            onChange={(e) =>
              update('mentionMinSeverity', e.target.value ? (e.target.value as RefxSeverity) : null)
            }
          >
            <option value="" className="bg-[var(--color-base-elevated)]">
              Every alert
            </option>
            {REFX_SEVERITIES.map((sev) => (
              <option key={sev} value={sev} className="bg-[var(--color-base-elevated)]">
                {sev}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Mention role ID" hint="Role to ping on qualifying alerts. Blank = no ping.">
        <input
          className={monoInputClass}
          value={config.mentionRoleId ?? ''}
          onChange={(e) => update('mentionRoleId', e.target.value.trim() || null)}
          placeholder="optional"
        />
      </Field>

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
