'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ESCALATION_ACTIONS,
  type EscalationAction,
  type ModerationConfig,
} from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveModerationConfig } from '../lib/config-actions';
import { Switch } from './ui/switch';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

const ACTION_LABELS: Record<EscalationAction, string> = {
  timeout: 'Time out',
  kick: 'Kick',
  ban: 'Ban',
};

/** Friendly presets for the "delete message history on ban" window (seconds). */
const DELETE_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "Don't delete any" },
  { value: 3_600, label: 'Previous 1 hour' },
  { value: 21_600, label: 'Previous 6 hours' },
  { value: 43_200, label: 'Previous 12 hours' },
  { value: 86_400, label: 'Previous 24 hours' },
  { value: 259_200, label: 'Previous 3 days' },
  { value: 604_800, label: 'Previous 7 days' },
];

const selectClass = `${inputClass} appearance-none pr-8`;

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
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof ModerationConfig>(key: K, value: ModerationConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function addRung(): void {
    const nextThreshold =
      config.escalation.reduce((max, r) => Math.max(max, r.threshold), 0) + 1;
    update('escalation', [
      ...config.escalation,
      { threshold: nextThreshold, action: 'timeout', durationMinutes: 60 },
    ]);
  }

  function updateRung(index: number, partial: Partial<ModerationConfig['escalation'][number]>): void {
    update(
      'escalation',
      config.escalation.map((rung, i) => (i === index ? { ...rung, ...partial } : rung)),
    );
  }

  function removeRung(index: number): void {
    update(
      'escalation',
      config.escalation.filter((_, i) => i !== index),
    );
  }

  function save(): void {
    startTransition(async () => {
      // Persist the ladder sorted by threshold so rungs read top-to-bottom.
      const payload: ModerationConfig = {
        ...config,
        escalation: [...config.escalation].sort((a, b) => a.threshold - b.threshold),
      };
      const result = await saveModerationConfig(guildId, payload);
      if (result.ok) setConfig(payload);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Moderator Roles"
        description="Roles that can use ReFx Assistant's moderation commands. Roles with Administrator are always bot masters."
      >
        <div className="flex max-w-xl flex-col gap-5">
          <Field label="Admin roles" hint="Full access to ReFx Assistant's configuration and moderation.">
            <RoleSelect
              roles={roles}
              multiple
              selected={config.adminRoleIds}
              onChange={(ids) => update('adminRoleIds', ids)}
            />
          </Field>
          <Field label="Moderator roles" hint="Can warn, mute, kick, and ban.">
            <RoleSelect
              roles={roles}
              multiple
              selected={config.modRoleIds}
              onChange={(ids) => update('modRoleIds', ids)}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Immune Roles"
        description="Members with these roles can never be warned, muted, kicked, or banned by ReFx Assistant."
      >
        <div className="max-w-xl">
          <Field label="Immune roles" hint="Moderation commands refuse to target these members.">
            <RoleSelect
              roles={roles}
              multiple
              selected={config.immuneRoleIds}
              onChange={(ids) => update('immuneRoleIds', ids)}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Logging & Mute Role"
        description="Where moderation cases are posted, and the role used for legacy mutes."
      >
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <Field label="Mod-log channel" hint="Every case (warn, mute, kick, ban…) is posted here.">
            <ChannelSelect
              channels={channels}
              only="text"
              placeholder="None"
              selected={config.modLogChannelId ? [config.modLogChannelId] : []}
              onChange={(ids) => update('modLogChannelId', ids[0] ?? null)}
            />
          </Field>
          <Field label="Mute role" hint="Legacy mute role (native timeouts are preferred).">
            <RoleSelect
              roles={roles}
              placeholder="None"
              selected={config.muteRoleId ? [config.muteRoleId] : []}
              onChange={(ids) => update('muteRoleId', ids[0] ?? null)}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Ban Behavior"
        description="What happens to a member's recent messages when they're banned."
      >
        <div className="max-w-xs">
          <Field label="Delete message history">
            <div className="relative">
              <select
                className={selectClass}
                value={config.deleteMessageSeconds}
                onChange={(e) => update('deleteMessageSeconds', Number(e.target.value))}
              >
                {DELETE_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Member Notifications"
        description="Whether ReFx Assistant DMs a member when a moderation action is taken against them."
      >
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div>
            <p className="text-sm text-white/90">DM members on action</p>
            <p className="text-xs text-white/50">Send the reason to the member when actioned.</p>
          </div>
          <Switch
            checked={config.dmOnAction}
            onChange={(next) => update('dmOnAction', next)}
            label="DM members on action"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Warn Escalation"
        description="Automatically punish members when their active warn count reaches a threshold."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-3">
          {config.escalation.length === 0 && (
            <p className="text-sm text-white/50">
              No escalation rules yet. Add one to auto-punish repeat offenders.
            </p>
          )}
          {config.escalation.map((rung, index) => (
            <div
              key={index}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-white/60">At warn #</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={`${inputClass} w-24`}
                  value={rung.threshold}
                  onChange={(e) =>
                    updateRung(index, {
                      threshold: Math.min(100, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-white/60">Action</span>
                <div className="relative">
                  <select
                    className={`${selectClass} w-32`}
                    value={rung.action}
                    onChange={(e) =>
                      updateRung(index, { action: e.target.value as EscalationAction })
                    }
                  >
                    {ESCALATION_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {ACTION_LABELS[action]}
                      </option>
                    ))}
                  </select>
                  <SelectChevron />
                </div>
              </label>
              {rung.action === 'timeout' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-white/60">Minutes</span>
                  <input
                    type="number"
                    min={1}
                    max={40_320}
                    className={`${inputClass} w-28`}
                    value={rung.durationMinutes}
                    onChange={(e) =>
                      updateRung(index, {
                        durationMinutes: Math.min(40_320, Math.max(1, Number(e.target.value) || 60)),
                      })
                    }
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => removeRung(index)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/60 transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          ))}
          {config.escalation.length < 20 && (
            <button
              type="button"
              onClick={addRung}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/70 transition-colors hover:border-[var(--color-brand)]/50 hover:text-white/90"
            >
              <Plus className="h-4 w-4" /> Add escalation rule
            </button>
          )}
        </div>
      </SettingsSection>

      <div className="pt-1">
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}

function SelectChevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
    >
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
