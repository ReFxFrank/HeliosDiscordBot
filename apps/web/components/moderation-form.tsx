'use client';

import { useState, useTransition } from 'react';
import type { ModerationConfig } from '@helios/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveModerationConfig } from '../lib/config-actions';
import { Switch } from './ui/switch';
import { ChannelSelect, RoleSelect } from './ui/entity-select';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-[var(--color-brand)]/60 font-mono';

export function ModerationForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: ModerationConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<ModerationConfig>(initial);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof ModerationConfig>(key: K, value: ModerationConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveModerationConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Mod roles" hint="Roles treated as moderators.">
        <RoleSelect
          roles={roles}
          multiple
          selected={config.modRoleIds}
          onChange={(ids) => update('modRoleIds', ids)}
        />
      </Field>

      <Field label="Admin roles" hint="Roles treated as admins.">
        <RoleSelect
          roles={roles}
          multiple
          selected={config.adminRoleIds}
          onChange={(ids) => update('adminRoleIds', ids)}
        />
      </Field>

      <Field label="Mute role" hint="Legacy mute role (timeouts are preferred).">
        <RoleSelect
          roles={roles}
          placeholder="None"
          selected={config.muteRoleId ? [config.muteRoleId] : []}
          onChange={(ids) => update('muteRoleId', ids[0] ?? null)}
        />
      </Field>

      <Field label="Mod-log channel" hint="Where moderation cases are posted.">
        <ChannelSelect
          channels={channels}
          only="text"
          placeholder="None"
          selected={config.modLogChannelId ? [config.modLogChannelId] : []}
          onChange={(ids) => update('modLogChannelId', ids[0] ?? null)}
        />
      </Field>

      <Field label="Delete recent messages (seconds)" hint="History deleted on ban (0–604800).">
        <input
          type="number"
          min={0}
          max={604800}
          className={inputClass}
          value={config.deleteMessageSeconds}
          onChange={(e) => update('deleteMessageSeconds', Math.max(0, Number(e.target.value) || 0))}
        />
      </Field>

      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div>
          <p className="text-sm text-white/90">DM users on action</p>
          <p className="text-xs text-white/50">Notify the target when actioned.</p>
        </div>
        <Switch
          checked={config.dmOnAction}
          onChange={(next) => update('dmOnAction', next)}
          label="DM users on action"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {status === 'saved' && (
          <span className="text-sm text-[var(--color-success)]">Saved — live on the bot.</span>
        )}
        {status === 'error' && (
          <span className="text-sm text-[var(--color-danger)]">Could not save.</span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-white/80">{label}</span>
      {children}
      {hint && <span className="text-xs text-white/40">{hint}</span>}
    </label>
  );
}
