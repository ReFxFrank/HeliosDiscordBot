'use client';

import { useState, useTransition, type ReactNode } from 'react';
import {
  AUTOMOD_ACTIONS,
  GATE_ACTIONS,
  type AutomodAction,
  type AutomodConfig,
  type GateAction,
} from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveAutomodConfig } from '../lib/config-actions';
import { liftLockdown, lockdownNow } from '../lib/lockdown-actions';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { Switch } from './ui/switch';

const toList = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

type FilterKey = 'invites' | 'links' | 'mentions' | 'caps' | 'spam' | 'words';
interface RuleLike {
  enabled: boolean;
  action: AutomodAction;
  timeoutMinutes: number;
}

const FILTER_LABELS: Record<FilterKey, string> = {
  invites: 'Discord invites',
  links: 'Links',
  mentions: 'Mass mentions',
  caps: 'Excessive caps',
  spam: 'Spam (message flood)',
  words: 'Blocked words',
};

export function AutomodForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: AutomodConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<AutomodConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  const [lockPending, startLock] = useTransition();

  function doLockdown(): void {
    if (
      !window.confirm(
        'Lock every channel now? Members won’t be able to send messages until you lift it.',
      )
    ) {
      return;
    }
    setLockMsg(null);
    startLock(async () => {
      const result = await lockdownNow(guildId);
      setLockMsg(result.ok ? 'Lockdown requested — the bot is locking channels.' : 'Could not start lockdown.');
    });
  }

  function doLift(): void {
    setLockMsg(null);
    startLock(async () => {
      const result = await liftLockdown(guildId);
      setLockMsg(result.ok ? 'Lift requested — channels are being restored.' : 'Could not lift lockdown.');
    });
  }

  function patch<K extends FilterKey>(key: K, value: Partial<AutomodConfig[K]>): void {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }));
    setStatus('idle');
  }

  function patchRaid(value: Partial<AutomodConfig['raid']>): void {
    setConfig((prev) => ({ ...prev, raid: { ...prev.raid, ...value } }));
    setStatus('idle');
  }

  function patchAntiNuke(value: Partial<AutomodConfig['antiNuke']>): void {
    setConfig((prev) => ({ ...prev, antiNuke: { ...prev.antiNuke, ...value } }));
    setStatus('idle');
  }

  const raid = config.raid;
  const antiNuke = config.antiNuke;

  function save(): void {
    startTransition(async () => {
      const result = await saveAutomodConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  function ruleControls(key: FilterKey, extra?: ReactNode): ReactNode {
    const rule = config[key] as RuleLike;
    return (
      <div className="rounded-lg border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-white/85">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) =>
                patch(key, { enabled: e.target.checked } as Partial<AutomodConfig[FilterKey]>)
              }
            />
            {FILTER_LABELS[key]}
          </label>
          <div className="flex items-center gap-2">
            <select
              className={`${inputClass} w-auto`}
              value={rule.action}
              onChange={(e) =>
                patch(key, { action: e.target.value as AutomodAction } as Partial<
                  AutomodConfig[FilterKey]
                >)
              }
            >
              {AUTOMOD_ACTIONS.map((action) => (
                <option key={action} value={action} className="bg-[var(--color-base-elevated)]">
                  {action}
                </option>
              ))}
            </select>
            {rule.action === 'timeout' && (
              <input
                type="number"
                min={1}
                max={10080}
                title="Timeout minutes"
                className={`${inputClass} w-20`}
                value={rule.timeoutMinutes}
                onChange={(e) =>
                  patch(key, {
                    timeoutMinutes: Math.max(1, Number(e.target.value) || 10),
                  } as Partial<AutomodConfig[FilterKey]>)
                }
              />
            )}
          </div>
        </div>
        {extra && <div className="mt-3">{extra}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Exempt roles" hint="Never auto-moderated.">
          <RoleSelect
            roles={roles}
            multiple
            selected={config.exemptRoleIds}
            onChange={(ids) => {
              setConfig((p) => ({ ...p, exemptRoleIds: ids }));
              setStatus('idle');
            }}
          />
        </Field>
        <Field label="Exempt channels" hint="Never auto-moderated.">
          <ChannelSelect
            channels={channels}
            multiple
            only="text"
            selected={config.exemptChannelIds}
            onChange={(ids) => {
              setConfig((p) => ({ ...p, exemptChannelIds: ids }));
              setStatus('idle');
            }}
          />
        </Field>
      </div>
      <p className="text-xs text-white/40">
        Members with Manage Messages are always exempt. Each filter deletes the message; the action
        adds a punishment.
      </p>

      {ruleControls('invites')}
      {ruleControls(
        'links',
        <Field label="Allowed domains" hint="Comma/newline-separated; everything else is blocked.">
          <input
            className={monoInputClass}
            value={config.links.allowlist.join(', ')}
            onChange={(e) => patch('links', { allowlist: toList(e.target.value) })}
          />
        </Field>,
      )}
      {ruleControls(
        'mentions',
        <Field label="Max mentions">
          <input
            type="number"
            min={1}
            max={50}
            className={`${inputClass} w-24`}
            value={config.mentions.maxMentions}
            onChange={(e) =>
              patch('mentions', { maxMentions: Math.max(1, Number(e.target.value) || 5) })
            }
          />
        </Field>,
      )}
      {ruleControls(
        'caps',
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Caps %">
            <input
              type="number"
              min={50}
              max={100}
              className={inputClass}
              value={config.caps.percent}
              onChange={(e) =>
                patch('caps', {
                  percent: Math.min(100, Math.max(50, Number(e.target.value) || 70)),
                })
              }
            />
          </Field>
          <Field label="Min length">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={config.caps.minLength}
              onChange={(e) =>
                patch('caps', { minLength: Math.max(1, Number(e.target.value) || 10) })
              }
            />
          </Field>
        </div>,
      )}
      {ruleControls(
        'spam',
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Max messages">
            <input
              type="number"
              min={2}
              max={30}
              className={inputClass}
              value={config.spam.maxMessages}
              onChange={(e) =>
                patch('spam', { maxMessages: Math.max(2, Number(e.target.value) || 5) })
              }
            />
          </Field>
          <Field label="Per seconds">
            <input
              type="number"
              min={1}
              max={60}
              className={inputClass}
              value={config.spam.windowSeconds}
              onChange={(e) =>
                patch('spam', { windowSeconds: Math.max(1, Number(e.target.value) || 5) })
              }
            />
          </Field>
        </div>,
      )}
      {ruleControls(
        'words',
        <Field label="Blocked words" hint="Comma/newline-separated. Whole-word, case-insensitive.">
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={config.words.list.join(', ')}
            onChange={(e) => patch('words', { list: toList(e.target.value) })}
          />
        </Field>,
      )}

      {/* Raid protection */}
      <div className="rounded-lg border border-white/10 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-white/85">
          <input
            type="checkbox"
            checked={raid.enabled}
            onChange={(e) => patchRaid({ enabled: e.target.checked })}
          />
          Raid protection
        </label>
        <p className="mt-1 text-xs text-white/40">
          Gate the door on join — reject young accounts and auto-sanction join floods.
        </p>
        {raid.enabled && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Min account age (hours)" hint="0 disables the age gate.">
                <input
                  type="number"
                  min={0}
                  max={8760}
                  className={inputClass}
                  value={raid.minAccountAgeHours}
                  onChange={(e) =>
                    patchRaid({
                      minAccountAgeHours: Math.min(8760, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                />
              </Field>
              <Field label="Action for young accounts">
                <select
                  className={inputClass}
                  value={raid.accountAgeAction}
                  onChange={(e) => patchRaid({ accountAgeAction: e.target.value as GateAction })}
                >
                  {GATE_ACTIONS.map((action) => (
                    <option key={action} value={action} className="bg-[var(--color-base-elevated)]">
                      {action}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Join threshold" hint="Joins that arm raid mode.">
                <input
                  type="number"
                  min={2}
                  max={100}
                  className={inputClass}
                  value={raid.joinThreshold}
                  onChange={(e) =>
                    patchRaid({
                      joinThreshold: Math.min(100, Math.max(2, Number(e.target.value) || 10)),
                    })
                  }
                />
              </Field>
              <Field label="Within seconds">
                <input
                  type="number"
                  min={1}
                  max={300}
                  className={inputClass}
                  value={raid.joinWindowSeconds}
                  onChange={(e) =>
                    patchRaid({
                      joinWindowSeconds: Math.min(300, Math.max(1, Number(e.target.value) || 10)),
                    })
                  }
                />
              </Field>
              <Field label="Raid action">
                <select
                  className={inputClass}
                  value={raid.raidAction}
                  onChange={(e) => patchRaid({ raidAction: e.target.value as GateAction })}
                >
                  {GATE_ACTIONS.map((action) => (
                    <option key={action} value={action} className="bg-[var(--color-base-elevated)]">
                      {action}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Raid-mode duration (seconds)" hint="How long the gate stays armed.">
                <input
                  type="number"
                  min={30}
                  max={3600}
                  className={inputClass}
                  value={raid.raidModeDurationSeconds}
                  onChange={(e) =>
                    patchRaid({
                      raidModeDurationSeconds: Math.min(
                        3600,
                        Math.max(30, Number(e.target.value) || 300),
                      ),
                    })
                  }
                />
              </Field>
              {(raid.accountAgeAction === 'timeout' || raid.raidAction === 'timeout') && (
                <Field label="Timeout minutes">
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    className={inputClass}
                    value={raid.timeoutMinutes}
                    onChange={(e) =>
                      patchRaid({ timeoutMinutes: Math.max(1, Number(e.target.value) || 60) })
                    }
                  />
                </Field>
              )}
            </div>
            <Field
              label="Alert channel"
              hint="Where the “raid engaged” notice posts. None = member log."
            >
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="None"
                selected={raid.alertChannelId ? [raid.alertChannelId] : []}
                onChange={(ids) => patchRaid({ alertChannelId: ids[0] ?? '' })}
              />
            </Field>
            <label className="flex items-center gap-3 text-sm text-white/80">
              <Switch
                checked={raid.pauseInvites}
                onChange={(next) => patchRaid({ pauseInvites: next })}
                label="Pause invites during a raid"
              />
              Pause server invites while raid mode is armed
              <span className="text-xs text-white/40">
                (Discord lifts the pause automatically; needs Manage Server)
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm text-white/80">
              <Switch
                checked={raid.lockdownOnRaid}
                onChange={(next) => patchRaid({ lockdownOnRaid: next })}
                label="Lock down the server during a raid"
              />
              Lock every channel when a raid trips
              <span className="text-xs text-white/40">
                (stays locked until you run <code>/lockdown end</code>; needs Manage Roles)
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Server lockdown (manual panic button) */}
      <div className="glass flex flex-col gap-4 rounded-2xl p-5">
        <div>
          <h3 className="text-base font-semibold text-white/90">Server lockdown</h3>
          <p className="mt-1 text-sm text-white/50">
            Instantly deny <span className="text-white/70">Send Messages</span> to @everyone in every
            text channel — the panic button for an active raid. Lifting it restores each channel to
            exactly how it was. You can also use <code>/lockdown start</code> and{' '}
            <code>/lockdown end</code> in Discord. Requires the bot to have{' '}
            <span className="text-white/70">Manage Roles</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={doLockdown}
            disabled={lockPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-danger)]/15 px-4 py-2 text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/25 disabled:opacity-50"
          >
            🔒 Lock server now
          </button>
          <button
            type="button"
            onClick={doLift}
            disabled={lockPending}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            🔓 Lift lockdown
          </button>
          {lockMsg && <span className="text-sm text-white/60">{lockMsg}</span>}
        </div>
      </div>

      {/* Anti-nuke */}
      <div className="glass flex flex-col gap-4 rounded-2xl p-5">
        <label className="flex items-center gap-3 text-base font-semibold text-white/90">
          <Switch
            checked={antiNuke.enabled}
            onChange={(next) => patchAntiNuke({ enabled: next })}
            label="Anti-nuke"
          />
          Anti-nuke
        </label>
        <p className="-mt-2 text-sm text-white/50">
          Stops a compromised or rogue mod account from mass-destroying the server: too many
          bans/kicks, channel deletions, or role deletions by one account in a short window and
          that account gets sanctioned. The owner and {`Solari`} are always exempt. Requires the
          bot to have <span className="text-white/70">View Audit Log</span>.
        </p>
        {antiNuke.enabled && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Window (seconds)" hint="Rolling window the counters live in.">
                <input
                  type="number"
                  min={10}
                  max={600}
                  className={inputClass}
                  value={antiNuke.windowSeconds}
                  onChange={(e) =>
                    patchAntiNuke({
                      windowSeconds: Math.min(600, Math.max(10, Number(e.target.value) || 60)),
                    })
                  }
                />
              </Field>
              <Field label="Action" hint="What happens to the offending account.">
                <select
                  className={inputClass}
                  value={antiNuke.action}
                  onChange={(e) =>
                    patchAntiNuke({ action: e.target.value as AutomodConfig['antiNuke']['action'] })
                  }
                >
                  <option value="strip-roles">Strip all roles (keep for investigation)</option>
                  <option value="kick">Kick</option>
                  <option value="ban">Ban</option>
                </select>
              </Field>
              <Field label="Bans + kicks threshold">
                <input
                  type="number"
                  min={2}
                  max={50}
                  className={inputClass}
                  value={antiNuke.banKickThreshold}
                  onChange={(e) =>
                    patchAntiNuke({
                      banKickThreshold: Math.min(50, Math.max(2, Number(e.target.value) || 5)),
                    })
                  }
                />
              </Field>
              <Field label="Channel deletions threshold">
                <input
                  type="number"
                  min={2}
                  max={50}
                  className={inputClass}
                  value={antiNuke.channelDeleteThreshold}
                  onChange={(e) =>
                    patchAntiNuke({
                      channelDeleteThreshold: Math.min(
                        50,
                        Math.max(2, Number(e.target.value) || 3),
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Role deletions threshold">
                <input
                  type="number"
                  min={2}
                  max={50}
                  className={inputClass}
                  value={antiNuke.roleDeleteThreshold}
                  onChange={(e) =>
                    patchAntiNuke({
                      roleDeleteThreshold: Math.min(50, Math.max(2, Number(e.target.value) || 3)),
                    })
                  }
                />
              </Field>
              <Field
                label="Exempt user IDs"
                hint="Trusted accounts (e.g. other bots), comma-separated."
              >
                <input
                  className={monoInputClass}
                  value={antiNuke.exemptUserIds.join(', ')}
                  onChange={(e) =>
                    patchAntiNuke({
                      exemptUserIds: e.target.value
                        .split(',')
                        .map((part) => part.trim())
                        .filter(Boolean)
                        .slice(0, 25),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Alert channel" hint="Where the alert posts. None = member log.">
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="None"
                selected={antiNuke.alertChannelId ? [antiNuke.alertChannelId] : []}
                onChange={(ids) => patchAntiNuke({ alertChannelId: ids[0] ?? '' })}
              />
            </Field>
          </div>
        )}
      </div>

      <p className="text-xs text-white/40">
        Looking for member verification? It has its own page now — see{' '}
        <span className="font-medium text-white/60">Verification</span> in the sidebar.
      </p>

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
