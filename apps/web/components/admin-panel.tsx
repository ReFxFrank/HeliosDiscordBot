'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { addBlacklist, removeBlacklist, setGlobalModule } from '../lib/admin-actions';
import { GlassCard } from './ui/glass-card';
import { Switch } from './ui/switch';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

export interface FeatureItem {
  module: string;
  name: string;
}

export interface BlacklistEntry {
  id: string;
  type: 'GUILD' | 'USER';
  targetId: string;
  reason: string | null;
  createdAt: string;
}

export function AdminPanel({
  blacklist,
  features,
  disabledModules,
}: {
  blacklist: BlacklistEntry[];
  features: FeatureItem[];
  disabledModules: string[];
}) {
  const [pending, startTransition] = useTransition();

  // --- Global feature flags ---
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set(disabledModules));

  function toggleModule(module: string, enable: boolean): void {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (enable) next.delete(module);
      else next.add(module);
      return next;
    });
    startTransition(async () => {
      const result = await setGlobalModule(module, enable);
      if (!result.ok) {
        // Revert the optimistic toggle on failure.
        setDisabled((prev) => {
          const next = new Set(prev);
          if (enable) next.add(module);
          else next.delete(module);
          return next;
        });
      }
    });
  }

  // --- Blacklist add ---
  const [blType, setBlType] = useState<'GUILD' | 'USER'>('USER');
  const [blTargetId, setBlTargetId] = useState('');
  const [blReason, setBlReason] = useState('');
  const [blStatus, setBlStatus] = useState<SaveStatus>('idle');

  function submitBlacklist(): void {
    const targetId = blTargetId.trim();
    if (!targetId) {
      setBlStatus('error');
      return;
    }
    startTransition(async () => {
      const result = await addBlacklist(blType, targetId, blReason.trim() || null);
      if (result.ok) {
        setBlTargetId('');
        setBlReason('');
        setBlStatus('saved');
      } else {
        setBlStatus('error');
      }
    });
  }

  function remove(type: 'GUILD' | 'USER', targetId: string): void {
    startTransition(async () => {
      await removeBlacklist(type, targetId);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-sm font-semibold text-white/80">Global features</h3>
          <p className="text-xs text-white/40">
            Turn a module off to disable it for <strong>every</strong> server at once — commands and
            background behaviour both stop. Takes effect within ~30s.
          </p>
        </div>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {features.map((feature) => {
            const on = !disabled.has(feature.module);
            return (
              <div
                key={feature.module}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <span className={`text-sm ${on ? 'text-white/85' : 'text-white/40'}`}>
                  {feature.name}
                </span>
                <Switch
                  checked={on}
                  onChange={(next) => toggleModule(feature.module, next)}
                  label={`Toggle ${feature.name}`}
                />
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold text-white/80">Blacklist</h3>
        <p className="text-xs text-white/40">
          Blacklisted guilds and users are refused by the bot on every command.
        </p>

        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <Field label="Type">
            <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {(['USER', 'GUILD'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setBlType(type);
                    setBlStatus('idle');
                  }}
                  className={`rounded-md px-5 py-1.5 text-sm font-medium transition-colors ${
                    blType === type
                      ? 'bg-[var(--color-brand-strong)] text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Target ID" hint="The user or guild snowflake to block.">
            <input
              className={monoInputClass}
              value={blTargetId}
              onChange={(e) => {
                setBlTargetId(e.target.value);
                setBlStatus('idle');
              }}
              placeholder="123456789012345678"
            />
          </Field>
        </div>
        <Field label="Reason" hint="Optional — shown in the admin list only.">
          <input
            className={inputClass}
            value={blReason}
            onChange={(e) => {
              setBlReason(e.target.value);
              setBlStatus('idle');
            }}
            placeholder="Spam / abuse"
          />
        </Field>
        <SaveBar
          pending={pending}
          status={blStatus}
          onSave={submitBlacklist}
          label="Add to blacklist"
          savedMessage="Added."
        />

        {blacklist.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-white/40">
            Nothing blacklisted.
          </GlassCard>
        ) : (
          <div className="flex flex-col divide-y divide-white/5 rounded-lg border border-white/10">
            {blacklist.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-xs text-white/60">
                  {entry.type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-white/85">{entry.targetId}</p>
                  {entry.reason && <p className="truncate text-xs text-white/40">{entry.reason}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(entry.type, entry.targetId)}
                  disabled={pending}
                  title="Remove"
                  className="shrink-0 rounded-md border border-[var(--color-danger)]/30 p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

/** Small stat tile used in the admin overview row. */
export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <GlassCard className="flex flex-col gap-1 p-5">
      <span className="text-xs font-medium text-white/50">{label}</span>
      <span className="text-2xl font-semibold text-white/90">{value.toLocaleString()}</span>
    </GlassCard>
  );
}
