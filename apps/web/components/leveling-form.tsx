'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { levelUpAnnounceModes, type LevelingConfig } from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveLevelingConfig } from '../lib/config-actions';
import { Switch } from './ui/switch';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';

type Reward = LevelingConfig['rewards'][number];

const blankReward: Reward = { level: 1, roleId: '' };

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
    setConfig((prev) => ({
      ...prev,
      rewards: prev.rewards.map((r, i) => (i === index ? { ...r, ...p } : r)),
    }));
    setStatus('idle');
  }

  function addReward(): void {
    setConfig((prev) => ({ ...prev, rewards: [...prev.rewards, { ...blankReward }] }));
    setStatus('idle');
  }

  function removeReward(index: number): void {
    setConfig((prev) => ({ ...prev, rewards: prev.rewards.filter((_, i) => i !== index) }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const cleaned = {
        ...config,
        rewards: config.rewards.filter((r) => r.roleId.trim()),
      };
      const result = await saveLevelingConfig(guildId, cleaned);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="XP per message (min)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={config.textXpMin}
            onChange={(e) => update('textXpMin', Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>
        <Field label="XP per message (max)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={config.textXpMax}
            onChange={(e) => update('textXpMax', Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>
      </div>

      <Field label="Cooldown (seconds)" hint="Minimum seconds between XP awards per user.">
        <input
          type="number"
          min={0}
          className={inputClass}
          value={config.xpCooldownSeconds}
          onChange={(e) => update('xpCooldownSeconds', Math.max(0, Number(e.target.value) || 0))}
        />
      </Field>

      <Field label="Level-up announcement">
        <select
          className={inputClass}
          value={config.announce}
          onChange={(e) => update('announce', e.target.value as LevelingConfig['announce'])}
        >
          {levelUpAnnounceModes.map((mode) => (
            <option key={mode} value={mode} className="bg-[var(--color-base-elevated)]">
              {mode}
            </option>
          ))}
        </select>
      </Field>

      {config.announce === 'CHANNEL' && (
        <Field label="Announcement channel">
          <ChannelSelect
            channels={channels}
            only="text"
            placeholder="None"
            selected={config.announceChannelId ? [config.announceChannelId] : []}
            onChange={(ids) => update('announceChannelId', ids[0] ?? null)}
          />
        </Field>
      )}

      <Field label="Level-up message" hint="Variables: {user} {level} {server}">
        <textarea
          rows={2}
          className={inputClass}
          value={config.levelUpMessage}
          onChange={(e) => update('levelUpMessage', e.target.value)}
        />
      </Field>

      <Field label="No-XP roles" hint="Roles that earn no XP.">
        <RoleSelect
          roles={roles}
          multiple
          selected={config.noXpRoleIds}
          onChange={(ids) => update('noXpRoleIds', ids)}
        />
      </Field>

      <Field label="No-XP channels" hint="Channels that earn no XP.">
        <ChannelSelect
          channels={channels}
          multiple
          selected={config.noXpChannelIds}
          onChange={(ids) => update('noXpChannelIds', ids)}
        />
      </Field>

      <Field label="Role rewards" hint="Grant a role when a member reaches a level.">
        <div className="flex flex-col gap-2">
          {config.rewards.map((reward, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
              <input
                type="number"
                min={1}
                className={inputClass}
                placeholder="Level"
                value={reward.level}
                onChange={(e) =>
                  patchReward(index, { level: Math.max(1, Number(e.target.value) || 1) })
                }
              />
              <RoleSelect
                roles={roles}
                placeholder="Select a role…"
                selected={reward.roleId ? [reward.roleId] : []}
                onChange={(ids) => patchReward(index, { roleId: ids[0] ?? '' })}
              />
              <button
                type="button"
                onClick={() => removeReward(index)}
                title="Remove"
                className="rounded-md border border-white/10 p-1.5 text-white/50 hover:text-[var(--color-danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addReward}
            className="inline-flex w-fit items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add reward
          </button>
        </div>
      </Field>

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

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
