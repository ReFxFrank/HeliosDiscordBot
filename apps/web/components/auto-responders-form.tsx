'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  AUTO_RESPONDER_MATCHES,
  type AutoResponder,
  type AutoResponderMatch,
  type CustomCommandsConfig,
} from '@helios/shared';
import { saveCustomCommandsConfig } from '../lib/config-actions';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

const blankResponder: AutoResponder = {
  trigger: '',
  match: 'contains',
  response: '',
  ignoreCase: true,
};

export function AutoRespondersForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: CustomCommandsConfig;
}) {
  const [config, setConfig] = useState<CustomCommandsConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function patchResponder(index: number, patch: Partial<AutoResponder>): void {
    setConfig((prev) => ({
      ...prev,
      autoResponders: prev.autoResponders.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
    setStatus('idle');
  }

  function addResponder(): void {
    setConfig((prev) => ({
      ...prev,
      autoResponders: [...prev.autoResponders, { ...blankResponder }],
    }));
    setStatus('idle');
  }

  function removeResponder(index: number): void {
    setConfig((prev) => ({
      ...prev,
      autoResponders: prev.autoResponders.filter((_, i) => i !== index),
    }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const cleaned = {
        ...config,
        autoResponders: config.autoResponders.filter((r) => r.trigger.trim() && r.response.trim()),
      };
      const result = await saveCustomCommandsConfig(guildId, cleaned);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Tag prefix" hint="Tags are invoked with this prefix, e.g. !rules.">
        <input
          className={monoInputClass}
          value={config.prefix}
          maxLength={5}
          onChange={(e) => {
            setConfig((prev) => ({ ...prev, prefix: e.target.value }));
            setStatus('idle');
          }}
        />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-white/80">Auto-responders</span>
          <button
            type="button"
            onClick={addResponder}
            disabled={config.autoResponders.length >= 50}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:text-white disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {config.autoResponders.length === 0 && (
            <p className="text-xs text-white/40">
              No auto-responders. Add one to reply automatically when a message matches.
            </p>
          )}
          {config.autoResponders.map((responder, index) => (
            <div key={index} className="rounded-lg border border-white/10 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  className={inputClass}
                  placeholder="Trigger text"
                  value={responder.trigger}
                  onChange={(e) => patchResponder(index, { trigger: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <select
                    className={inputClass}
                    value={responder.match}
                    onChange={(e) =>
                      patchResponder(index, { match: e.target.value as AutoResponderMatch })
                    }
                  >
                    {AUTO_RESPONDER_MATCHES.map((m) => (
                      <option key={m} value={m} className="bg-[var(--color-base-elevated)]">
                        {m}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeResponder(index)}
                    title="Remove"
                    className="rounded-md border border-white/10 p-1.5 text-white/50 hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <textarea
                className={`${inputClass} mt-2 min-h-14 resize-y`}
                placeholder="Response"
                maxLength={2000}
                value={responder.response}
                onChange={(e) => patchResponder(index, { response: e.target.value })}
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={responder.ignoreCase}
                  onChange={(e) => patchResponder(index, { ignoreCase: e.target.checked })}
                />
                Ignore case
              </label>
            </div>
          ))}
        </div>
      </div>

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
