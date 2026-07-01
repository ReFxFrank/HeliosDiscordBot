'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { levelUpAnnounceModes, type LevelingConfig } from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveLevelingConfig } from '../lib/config-actions';
import { Switch } from './ui/switch';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { MessageComposer, LEVEL_PLACEHOLDERS } from './ui/message-composer';

type Reward = LevelingConfig['rewards'][number];

const ANNOUNCE_LABELS: Record<(typeof levelUpAnnounceModes)[number], string> = {
  CURRENT: 'In the channel where they leveled up',
  CHANNEL: 'In a specific channel',
  DM: 'Direct message',
  OFF: "Don't announce",
};

const selectClass = `${inputClass} appearance-none pr-8`;

const clampInt = (value: string, min: number, fallback: number): number => {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : Math.max(min, Math.round(n));
};

export function LevelingForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: LevelingConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<LevelingConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof LevelingConfig>(key: K, value: LevelingConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function patchReward(index: number, p: Partial<Reward>): void {
    update(
      'rewards',
      config.rewards.map((r, i) => (i === index ? { ...r, ...p } : r)),
    );
  }
  function addReward(): void {
    update('rewards', [...config.rewards, { level: 1, roleId: '' }]);
  }
  function removeReward(index: number): void {
    update('rewards', config.rewards.filter((_, i) => i !== index));
  }

  function save(): void {
    startTransition(async () => {
      const payload: LevelingConfig = {
        ...config,
        textXpMax: Math.max(config.textXpMin, config.textXpMax),
        rewards: config.rewards.filter((r) => r.roleId.trim()),
      };
      const result = await saveLevelingConfig(guildId, payload);
      if (result.ok) setConfig(payload);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="XP Rates"
        description="How much XP members earn from messages and voice activity."
      >
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <Field label="XP per message (min)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={config.textXpMin}
              onChange={(e) => update('textXpMin', clampInt(e.target.value, 0, 15))}
            />
          </Field>
          <Field label="XP per message (max)" hint="Kept ≥ minimum.">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={config.textXpMax}
              onChange={(e) => update('textXpMax', clampInt(e.target.value, 0, 25))}
            />
          </Field>
          <Field label="Message cooldown (seconds)" hint="Minimum gap between XP awards per member.">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={config.xpCooldownSeconds}
              onChange={(e) => update('xpCooldownSeconds', clampInt(e.target.value, 0, 60))}
            />
          </Field>
          <Field label="Voice XP per minute" hint="XP earned per minute in voice (0 disables).">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={config.voiceXpPerMinute}
              onChange={(e) => update('voiceXpPerMinute', clampInt(e.target.value, 0, 10))}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Level-Up Announcements"
        description="Where and how Solari celebrates a member reaching a new level."
      >
        <div className="flex flex-col gap-5">
          <div className="max-w-md">
            <Field label="Announce level-ups">
              <div className="relative">
                <select
                  className={selectClass}
                  value={config.announce}
                  onChange={(e) => update('announce', e.target.value as LevelingConfig['announce'])}
                >
                  {levelUpAnnounceModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {ANNOUNCE_LABELS[mode]}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </Field>
          </div>
          {config.announce === 'CHANNEL' && (
            <div className="max-w-md">
              <Field label="Announcement channel">
                <ChannelSelect
                  channels={channels}
                  only="text"
                  placeholder="None"
                  selected={config.announceChannelId ? [config.announceChannelId] : []}
                  onChange={(ids) => update('announceChannelId', ids[0] ?? null)}
                />
              </Field>
            </div>
          )}
          {config.announce !== 'OFF' && (
            <Field label="Level-up message">
              <MessageComposer
                value={config.levelUpMessage}
                onChange={(v) => update('levelUpMessage', v)}
                placeholders={LEVEL_PLACEHOLDERS}
                rows={2}
              />
            </Field>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Rank Card"
        description="The image shown by /rank with a member's avatar, level, and XP bar."
        defaultOpen={false}
      >
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div>
            <p className="text-sm text-white/90">Enable rank cards</p>
            <p className="text-xs text-white/50">/rank renders a generated card instead of text.</p>
          </div>
          <Switch
            checked={config.cardEnabled}
            onChange={(next) => update('cardEnabled', next)}
            label="Enable rank cards"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="XP Restrictions"
        description="Roles and channels that earn no XP (e.g. bots, spam, or command channels)."
        defaultOpen={false}
      >
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <Field label="No-XP roles">
            <RoleSelect
              roles={roles}
              multiple
              selected={config.noXpRoleIds}
              onChange={(ids) => update('noXpRoleIds', ids)}
            />
          </Field>
          <Field label="No-XP channels">
            <ChannelSelect
              channels={channels}
              multiple
              only="text"
              selected={config.noXpChannelIds}
              onChange={(ids) => update('noXpChannelIds', ids)}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Level Role Rewards"
        description="Grant a role when a member reaches a level."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {config.rewards.length === 0 && (
              <p className="text-sm text-white/50">No rewards yet. Add one to grant roles by level.</p>
            )}
            {config.rewards.map((reward, index) => (
              <div key={index} className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-white/60">At level</span>
                  <input
                    type="number"
                    min={1}
                    className={`${inputClass} w-24`}
                    value={reward.level}
                    onChange={(e) => patchReward(index, { level: clampInt(e.target.value, 1, 1) })}
                  />
                </label>
                <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                  <span className="text-xs font-medium text-white/60">Grant role</span>
                  <RoleSelect
                    roles={roles}
                    placeholder="Select a role…"
                    selected={reward.roleId ? [reward.roleId] : []}
                    onChange={(ids) => patchReward(index, { roleId: ids[0] ?? '' })}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeReward(index)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/60 transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addReward}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/70 transition-colors hover:border-[var(--color-brand)]/50 hover:text-white/90"
            >
              <Plus className="h-4 w-4" /> Add reward
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div>
              <p className="text-sm text-white/90">Stack reward roles</p>
              <p className="text-xs text-white/50">Keep lower roles instead of replacing them.</p>
            </div>
            <Switch
              checked={config.roleRewardStack}
              onChange={(next) => update('roleRewardStack', next)}
              label="Stack reward roles"
            />
          </div>
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
