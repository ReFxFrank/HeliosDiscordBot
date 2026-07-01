'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ACHIEVEMENT_TIER_EMOJI,
  ACHIEVEMENT_TIER_LABELS,
  ACHIEVEMENT_TIERS,
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_TYPE_LABELS,
  achievementsConfigSchema,
  type Achievement,
  type AchievementsConfig,
  type AchievementTier,
} from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveAchievementsConfig } from '../lib/config-actions';
import { Switch } from './ui/switch';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';

const MAX_ACHIEVEMENTS = 50;

const TIER_BADGE: Record<AchievementTier, string> = {
  bronze: 'bg-amber-700/20 text-amber-400 ring-amber-600/30',
  silver: 'bg-slate-300/15 text-slate-200 ring-slate-300/30',
  gold: 'bg-yellow-400/15 text-yellow-300 ring-yellow-400/30',
  diamond: 'bg-cyan-300/15 text-cyan-200 ring-cyan-300/30',
};

const selectClass = `${inputClass} appearance-none pr-8`;

function newAchievement(): Achievement {
  return {
    id: crypto.randomUUID(),
    name: '',
    type: 'LEVEL',
    threshold: 10,
    tier: 'bronze',
    rewardRoleId: null,
    rewardCoins: 0,
    rewardXp: 0,
  };
}

export function AchievementsForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: AchievementsConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<AchievementsConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof AchievementsConfig>(key: K, value: AchievementsConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
    setError(null);
  }

  function patchAchievement(index: number, p: Partial<Achievement>): void {
    setConfig((prev) => ({
      ...prev,
      achievements: prev.achievements.map((a, i) => (i === index ? { ...a, ...p } : a)),
    }));
    setStatus('idle');
    setError(null);
  }

  function addAchievement(): void {
    setConfig((prev) =>
      prev.achievements.length >= MAX_ACHIEVEMENTS
        ? prev
        : { ...prev, achievements: [...prev.achievements, newAchievement()] },
    );
    setStatus('idle');
    setError(null);
  }

  function removeAchievement(index: number): void {
    setConfig((prev) => ({
      ...prev,
      achievements: prev.achievements.filter((_, i) => i !== index),
    }));
    setStatus('idle');
    setError(null);
  }

  function save(): void {
    startTransition(async () => {
      const cleaned: AchievementsConfig = {
        ...config,
        achievements: config.achievements.filter((a) => a.name.trim()),
      };
      const parsed = achievementsConfigSchema.safeParse(cleaned);
      if (!parsed.success) {
        setStatus('error');
        setError(parsed.error.issues[0]?.message ?? 'Some achievements are invalid.');
        return;
      }
      setError(null);
      const result = await saveAchievementsConfig(guildId, parsed.data);
      if (result.ok) setConfig(parsed.data);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  // Tier tally for the summary chips.
  const tierCounts = ACHIEVEMENT_TIERS.map((tier) => ({
    tier,
    count: config.achievements.filter((a) => a.tier === tier).length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Unlock Announcements"
        description="Celebrate members when they unlock an achievement."
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div>
              <p className="text-sm text-white/90">Announce unlocks</p>
              <p className="text-xs text-white/50">Post a message when a member unlocks one.</p>
            </div>
            <Switch
              checked={config.announce}
              onChange={(next) => update('announce', next)}
              label="Announce unlocks"
            />
          </div>
          {config.announce && (
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
        </div>
      </SettingsSection>

      <SettingsSection
        title="Achievements"
        description="Milestones members unlock by reaching a level, message, coin, or voice threshold."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {tierCounts.map(({ tier, count }) => (
              <span
                key={tier}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TIER_BADGE[tier]}`}
              >
                {ACHIEVEMENT_TIER_EMOJI[tier]} {ACHIEVEMENT_TIER_LABELS[tier]}
                <span className="opacity-70">{count}</span>
              </span>
            ))}
            <span className="ml-auto text-xs text-white/40">
              {config.achievements.length}/{MAX_ACHIEVEMENTS}
            </span>
          </div>

          {config.achievements.length === 0 && (
            <p className="text-sm text-white/50">No achievements yet. Add one to get started.</p>
          )}

          {config.achievements.map((achievement, index) => (
            <div
              key={achievement.id}
              className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TIER_BADGE[achievement.tier]}`}
                >
                  {ACHIEVEMENT_TIER_EMOJI[achievement.tier]}
                </span>
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="First Steps"
                      maxLength={100}
                      value={achievement.name}
                      onChange={(e) => patchAchievement(index, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Description" hint="Optional.">
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="Reach level 10"
                      maxLength={200}
                      value={achievement.description ?? ''}
                      onChange={(e) =>
                        patchAchievement(index, { description: e.target.value || undefined })
                      }
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => removeAchievement(index)}
                  title="Remove"
                  className="mt-6 rounded-md border border-white/10 p-1.5 text-white/50 hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Tier">
                  <div className="relative">
                    <select
                      className={selectClass}
                      value={achievement.tier}
                      onChange={(e) =>
                        patchAchievement(index, { tier: e.target.value as AchievementTier })
                      }
                    >
                      {ACHIEVEMENT_TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {ACHIEVEMENT_TIER_LABELS[tier]}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </Field>
                <Field label="Type">
                  <div className="relative">
                    <select
                      className={selectClass}
                      value={achievement.type}
                      onChange={(e) =>
                        patchAchievement(index, { type: e.target.value as Achievement['type'] })
                      }
                    >
                      {ACHIEVEMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ACHIEVEMENT_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </Field>
                <Field label="Threshold">
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={achievement.threshold}
                    onChange={(e) =>
                      patchAchievement(index, { threshold: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </Field>
              </div>

              <Field label="Reward role" hint="Granted on unlock. Optional.">
                <RoleSelect
                  roles={roles}
                  placeholder="None"
                  selected={achievement.rewardRoleId ? [achievement.rewardRoleId] : []}
                  onChange={(ids) => patchAchievement(index, { rewardRoleId: ids[0] ?? null })}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Reward coins">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={achievement.rewardCoins}
                    onChange={(e) =>
                      patchAchievement(index, { rewardCoins: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </Field>
                <Field label="Reward XP">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={achievement.rewardXp}
                    onChange={(e) =>
                      patchAchievement(index, { rewardXp: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </Field>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addAchievement}
            disabled={config.achievements.length >= MAX_ACHIEVEMENTS}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/70 transition-colors hover:border-[var(--color-brand)]/50 hover:text-white/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add achievement
          </button>
        </div>
      </SettingsSection>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

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
