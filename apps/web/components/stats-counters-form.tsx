'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  STAT_COUNTER_LABELS,
  STAT_COUNTER_TYPES,
  type StatCounter,
  type StatCounterType,
  type StatsCountersConfig,
} from '@helios/shared';
import { saveStatsCountersConfig } from '../lib/config-actions';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

const blank: StatCounter = { channelId: '', type: 'members', template: '{count} members' };

export function StatsCountersForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: StatsCountersConfig;
}) {
  const [config, setConfig] = useState<StatsCountersConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function patch(index: number, p: Partial<StatCounter>): void {
    setConfig((prev) => ({
      ...prev,
      counters: prev.counters.map((c, i) => (i === index ? { ...c, ...p } : c)),
    }));
    setStatus('idle');
  }

  function add(): void {
    setConfig((prev) => ({ ...prev, counters: [...prev.counters, { ...blank }] }));
    setStatus('idle');
  }

  function remove(index: number): void {
    setConfig((prev) => ({ ...prev, counters: prev.counters.filter((_, i) => i !== index) }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const cleaned = {
        ...config,
        counters: config.counters.filter((c) => c.channelId.trim()),
      };
      const result = await saveStatsCountersConfig(guildId, cleaned);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-white/40">
        Point each counter at a (usually voice) channel the bot can rename. Use{' '}
        <code className="font-mono">{'{count}'}</code> in the name template.
      </p>

      <div className="flex flex-col gap-3">
        {config.counters.map((counter, index) => (
          <div key={index} className="rounded-lg border border-white/10 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
              <input
                className={monoInputClass}
                placeholder="channel ID"
                value={counter.channelId}
                onChange={(e) => patch(index, { channelId: e.target.value.trim() })}
              />
              <select
                className={inputClass}
                value={counter.type}
                onChange={(e) => patch(index, { type: e.target.value as StatCounterType })}
              >
                {STAT_COUNTER_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-[var(--color-base-elevated)]">
                    {STAT_COUNTER_LABELS[t]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => remove(index)}
                title="Remove"
                className="rounded-md border border-white/10 p-1.5 text-white/50 hover:text-[var(--color-danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              className={`${inputClass} mt-2`}
              placeholder="{count} members"
              maxLength={100}
              value={counter.template}
              onChange={(e) => patch(index, { template: e.target.value })}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          disabled={config.counters.length >= 10}
          className="inline-flex w-fit items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add counter
        </button>
      </div>

      <Field label="Refresh interval (minutes)" hint="5–1440. Discord rate-limits channel renames.">
        <input
          type="number"
          min={5}
          max={1440}
          className={inputClass}
          value={config.intervalMinutes}
          onChange={(e) =>
            setConfig((prev) => ({
              ...prev,
              intervalMinutes: Math.min(1440, Math.max(5, Number(e.target.value) || 10)),
            }))
          }
        />
      </Field>

      <SaveBar pending={pending} status={status} onSave={save} savedMessage="Saved — refreshing." />
    </div>
  );
}
