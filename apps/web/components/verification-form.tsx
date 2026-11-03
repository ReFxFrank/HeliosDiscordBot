'use client';

import { useState, useTransition } from 'react';
import { MousePointerClick, ScanText, Send } from 'lucide-react';
import {
  VERIFICATION_FAIL_ACTIONS,
  type VerificationConfig,
  type VerificationFailAction,
  type VerificationMethod,
} from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveVerificationConfig } from '../lib/config-actions';
import { deployVerificationPanel } from '../lib/verification-actions';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { cn } from '../lib/utils';

const METHODS: { key: VerificationMethod; label: string; desc: string; icon: typeof ScanText }[] = [
  {
    key: 'button',
    label: 'Button click',
    desc: 'One click on the panel grants the verified role. Low friction.',
    icon: MousePointerClick,
  },
  {
    key: 'captcha',
    label: 'Image captcha',
    desc: 'Members must read a generated code and type it in. Strong bot protection.',
    icon: ScanText,
  },
];

const FAIL_LABELS: Record<VerificationFailAction, string> = {
  none: 'Do nothing (they can retry)',
  kick: 'Kick from the server',
};

const selectClass = `${inputClass} appearance-none pr-8`;

export function VerificationForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: VerificationConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<VerificationConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [deployMsg, setDeployMsg] = useState<string | null>(null);
  const [deployFailed, setDeployFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof VerificationConfig>(key: K, value: VerificationConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveVerificationConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  function deploy(): void {
    setDeployMsg(null);
    startTransition(async () => {
      const result = await deployVerificationPanel(guildId);
      setDeployFailed(!result.ok);
      // The bot posts the panel asynchronously — "sent" is honest; "deployed"
      // would claim an outcome the dashboard can't observe.
      setDeployMsg(
        result.ok
          ? 'Deploy sent — the panel should appear in the channel within a second.'
          : (result.error ?? 'Could not deploy.'),
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Verification Method"
        description="How new members prove they're human before unlocking the server."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {METHODS.map((method) => {
            const Icon = method.icon;
            const active = config.method === method.key;
            return (
              <button
                key={method.key}
                type="button"
                onClick={() => update('method', method.key)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors',
                  active
                    ? 'border-[var(--color-brand)]/60 bg-[var(--color-brand)]/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                )}
              >
                <Icon
                  className={cn('h-6 w-6', active ? 'text-[var(--color-brand-bright)]' : 'text-white/50')}
                />
                <span className="font-semibold text-white/90">{method.label}</span>
                <span className="text-xs text-white/50">{method.desc}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Roles"
        description="The role granted on success, and the optional gate role applied on join."
      >
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <Field label="Verified role" hint="Granted on a successful verify. Required.">
            <RoleSelect
              roles={roles}
              placeholder="None"
              selected={config.verifiedRoleId ? [config.verifiedRoleId] : []}
              onChange={(ids) => update('verifiedRoleId', ids[0] ?? '')}
            />
          </Field>
          <Field label="Unverified role" hint="Optional. Added on join, removed on verify.">
            <RoleSelect
              roles={roles}
              placeholder="None"
              selected={config.unverifiedRoleId ? [config.unverifiedRoleId] : []}
              onChange={(ids) => update('unverifiedRoleId', ids[0] ?? '')}
            />
          </Field>
        </div>
      </SettingsSection>

      {config.method === 'captcha' && (
        <SettingsSection
          title="Captcha Security"
          description="Difficulty, attempt limits, and what happens on repeated failure."
        >
          <div className="grid max-w-2xl gap-5 sm:grid-cols-3">
            <Field label="Code length" hint="Characters in the captcha (4–8).">
              <input
                type="number"
                min={4}
                max={8}
                className={inputClass}
                value={config.captchaLength}
                onChange={(e) =>
                  update('captchaLength', Math.min(8, Math.max(4, Number(e.target.value) || 5)))
                }
              />
            </Field>
            <Field label="Max attempts" hint="Before the fail action applies.">
              <input
                type="number"
                min={1}
                max={10}
                className={inputClass}
                value={config.maxAttempts}
                onChange={(e) =>
                  update('maxAttempts', Math.min(10, Math.max(1, Number(e.target.value) || 3)))
                }
              />
            </Field>
            <Field label="On failure">
              <div className="relative">
                <select
                  className={selectClass}
                  value={config.failAction}
                  onChange={(e) => update('failAction', e.target.value as VerificationFailAction)}
                >
                  {VERIFICATION_FAIL_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {FAIL_LABELS[action]}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </Field>
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        title="Requirements"
        description="Anti-alt gates checked before a member may verify (either method)."
        defaultOpen={false}
      >
        <div className="grid max-w-xl gap-5 sm:grid-cols-2">
          <Field label="Min account age (hours)" hint="0 disables. Blocks brand-new accounts.">
            <input
              type="number"
              min={0}
              max={8760}
              className={inputClass}
              value={config.minAccountAgeHours}
              onChange={(e) =>
                update(
                  'minAccountAgeHours',
                  Math.min(8760, Math.max(0, Math.round(Number(e.target.value) || 0))),
                )
              }
            />
          </Field>
          <Field label="Min time in server (minutes)" hint="0 disables. Defeats instant bot joins.">
            <input
              type="number"
              min={0}
              max={10080}
              className={inputClass}
              value={config.minServerAgeMinutes}
              onChange={(e) =>
                update(
                  'minServerAgeMinutes',
                  Math.min(10080, Math.max(0, Math.round(Number(e.target.value) || 0))),
                )
              }
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Verification Panel"
        description="The embed + button members click to start verifying. Save, then deploy."
      >
        <div className="flex flex-col gap-5">
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <Field label="Panel title">
              <input
                className={inputClass}
                maxLength={256}
                value={config.panelTitle}
                onChange={(e) => update('panelTitle', e.target.value)}
              />
            </Field>
            <Field label="Button label">
              <input
                className={inputClass}
                maxLength={80}
                value={config.buttonLabel}
                onChange={(e) => update('buttonLabel', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Panel message">
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              maxLength={2000}
              value={config.panelMessage}
              onChange={(e) => update('panelMessage', e.target.value)}
            />
          </Field>
          <Field label="Success message" hint="Shown privately after verifying.">
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              maxLength={2000}
              value={config.successMessage}
              onChange={(e) => update('successMessage', e.target.value)}
            />
          </Field>
          <div className="max-w-md">
            <Field label="Panel channel" hint="Where the panel is deployed. Save first, then deploy.">
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="None"
                selected={config.panelChannelId ? [config.panelChannelId] : []}
                onChange={(ids) => update('panelChannelId', ids[0] ?? null)}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={deploy}
              disabled={pending || !config.panelChannelId}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> Deploy panel
            </button>
            {deployMsg && (
              <span
                className={`text-sm ${deployFailed ? 'font-medium text-[var(--color-danger)]' : 'text-white/60'}`}
              >
                {deployMsg}
              </span>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Logging"
        description="Post verification passes, failures, and kicks to a channel."
        defaultOpen={false}
      >
        <div className="max-w-md">
          <Field label="Log channel" hint="None disables verification logging.">
            <ChannelSelect
              channels={channels}
              only="text"
              placeholder="None"
              selected={config.logChannelId ? [config.logChannelId] : []}
              onChange={(ids) => update('logChannelId', ids[0] ?? null)}
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
