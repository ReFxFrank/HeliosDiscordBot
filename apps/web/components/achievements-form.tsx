'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, Layers, Plus, Search, Sparkles, Square, Trash2 } from 'lucide-react';
import {
  ACHIEVEMENT_PRESETS,
  ACHIEVEMENT_TIER_EMOJI,
  ACHIEVEMENT_TIER_LABELS,
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_TYPE_LABELS,
  ACHIEVEMENT_TYPE_UNIT,
  achievementsConfigSchema,
  isTieredAchievement,
  tierAt,
  type Achievement,
  type AchievementsConfig,
  type AchievementTierDef,
} from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveAchievementsConfig } from '../lib/config-actions';
import { Switch } from './ui/switch';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';

const MAX = 50;
const selectClass = `${inputClass} appearance-none pr-8`;

const bareTier = (threshold: number): AchievementTierDef => ({
  threshold,
  rewardRoleId: null,
  rewardXp: 0,
});

const newSingle = (): Achievement => ({
  id: crypto.randomUUID(),
  name: 'New achievement',
  description: '',
  type: 'MESSAGES',
  enabled: true,
  tiers: [bareTier(100)],
});

const newTiered = (): Achievement => ({
  id: crypto.randomUUID(),
  name: 'New tiered achievement',
  description: '',
  type: 'MESSAGES',
  enabled: true,
  tiers: [bareTier(25), bareTier(250), bareTier(1000), bareTier(6000)],
});

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
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function touched(): void {
    setStatus('idle');
    setError(null);
  }

  function update<K extends keyof AchievementsConfig>(key: K, value: AchievementsConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    touched();
  }

  function patchAch(id: string, p: Partial<Achievement>): void {
    setConfig((prev) => ({
      ...prev,
      achievements: prev.achievements.map((a) => (a.id === id ? { ...a, ...p } : a)),
    }));
    touched();
  }

  function patchTier(id: string, tierIndex: number, p: Partial<AchievementTierDef>): void {
    setConfig((prev) => ({
      ...prev,
      achievements: prev.achievements.map((a) =>
        a.id === id
          ? { ...a, tiers: a.tiers.map((t, i) => (i === tierIndex ? { ...t, ...p } : t)) }
          : a,
      ),
    }));
    touched();
  }

  function addTier(id: string): void {
    setConfig((prev) => ({
      ...prev,
      achievements: prev.achievements.map((a) => {
        if (a.id !== id || a.tiers.length >= 4) return a;
        const last = a.tiers[a.tiers.length - 1]?.threshold ?? 0;
        return { ...a, tiers: [...a.tiers, bareTier(last * 2 || 100)] };
      }),
    }));
    touched();
  }

  function removeTier(id: string, tierIndex: number): void {
    setConfig((prev) => ({
      ...prev,
      achievements: prev.achievements.map((a) =>
        a.id === id && a.tiers.length > 1
          ? { ...a, tiers: a.tiers.filter((_, i) => i !== tierIndex) }
          : a,
      ),
    }));
    touched();
  }

  function addAchievement(make: () => Achievement): void {
    if (config.achievements.length >= MAX) return;
    const created = make();
    update('achievements', [...config.achievements, created]);
    setExpanded(created.id);
  }

  function removeAch(id: string): void {
    update(
      'achievements',
      config.achievements.filter((a) => a.id !== id),
    );
  }

  function addPresets(): void {
    setConfig((prev) => {
      const existing = new Set(prev.achievements.map((a) => a.name.trim().toLowerCase()));
      const room = MAX - prev.achievements.length;
      const toAdd = ACHIEVEMENT_PRESETS.filter((p) => !existing.has(p.name.toLowerCase()))
        .slice(0, Math.max(0, room))
        .map((p) => ({ ...p, id: crypto.randomUUID() }));
      return { ...prev, achievements: [...prev.achievements, ...toAdd] };
    });
    touched();
  }

  function save(): void {
    startTransition(async () => {
      const cleaned: AchievementsConfig = {
        ...config,
        achievements: config.achievements
          .filter((a) => a.name.trim())
          .map((a) => ({ ...a, tiers: [...a.tiers].sort((x, y) => x.threshold - y.threshold) })),
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

  const visible = config.achievements.filter((a) =>
    a.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Configuration"
        description="Celebrate members when they unlock an achievement (or a new tier)."
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

      {/* Create cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => addAchievement(newSingle)}
          disabled={config.achievements.length >= MAX}
          className="glass flex flex-col items-center gap-2 rounded-2xl p-6 text-center transition-colors hover:border-[var(--color-brand)]/40 disabled:opacity-50"
        >
          <Square className="h-8 w-8 text-white/50" />
          <span className="font-semibold text-white/90">Single achievement</span>
          <span className="text-xs text-white/50">A one-time achievement with no tiers.</span>
        </button>
        <button
          type="button"
          onClick={() => addAchievement(newTiered)}
          disabled={config.achievements.length >= MAX}
          className="glass flex flex-col items-center gap-2 rounded-2xl p-6 text-center transition-colors hover:border-[var(--color-brand)]/40 disabled:opacity-50"
        >
          <Layers className="h-8 w-8 text-[var(--color-brand-bright)]" />
          <span className="font-semibold text-white/90">Tiered achievement</span>
          <span className="text-xs text-white/50">
            Bronze → Diamond tiers members unlock as they progress.
          </span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Search for an achievement"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={addPresets}
          disabled={config.achievements.length >= MAX}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-brand)]/30 bg-[var(--color-brand)]/10 px-3 py-2 text-sm font-medium text-[var(--color-brand-bright)] transition-colors hover:bg-[var(--color-brand)]/20 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> Add starter set
        </button>
        <span className="shrink-0 text-xs text-white/40">
          {config.achievements.length}/{MAX}
        </span>
      </div>

      {/* Grid */}
      {config.achievements.length === 0 ? (
        <p className="text-sm text-white/50">
          No achievements yet. Create one above, or add the starter set.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-white/50">No achievements match “{query}”.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((a) => (
            <AchievementCard
              key={a.id}
              a={a}
              roles={roles}
              expanded={expanded === a.id}
              onToggleExpand={() => setExpanded(expanded === a.id ? null : a.id)}
              onPatch={(p) => patchAch(a.id, p)}
              onPatchTier={(i, p) => patchTier(a.id, i, p)}
              onAddTier={() => addTier(a.id)}
              onRemoveTier={(i) => removeTier(a.id, i)}
              onRemove={() => removeAch(a.id)}
              selectClass={selectClass}
            />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="pt-1">
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}

function AchievementCard({
  a,
  roles,
  expanded,
  onToggleExpand,
  onPatch,
  onPatchTier,
  onAddTier,
  onRemoveTier,
  onRemove,
  selectClass,
}: {
  a: Achievement;
  roles: RoleOption[];
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (p: Partial<Achievement>) => void;
  onPatchTier: (tierIndex: number, p: Partial<AchievementTierDef>) => void;
  onAddTier: () => void;
  onRemoveTier: (tierIndex: number) => void;
  onRemove: () => void;
  selectClass: string;
}) {
  const tiered = isTieredAchievement(a);
  const unit = ACHIEVEMENT_TYPE_UNIT[a.type];

  return (
    <div className={`glass flex flex-col rounded-2xl p-4 ${a.enabled ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-lg">
          {tiered ? '🎖️' : '🏆'}
        </span>
        <button type="button" onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
          <p className="truncate font-semibold text-white/90">{a.name || 'Untitled'}</p>
          <p className="truncate text-xs text-white/50">
            {a.description || ACHIEVEMENT_TYPE_LABELS[a.type]}
          </p>
        </button>
        <Switch checked={a.enabled} onChange={(next) => onPatch({ enabled: next })} label="Enabled" />
        <button type="button" onClick={onToggleExpand} aria-label="Expand">
          <ChevronDown
            className={`h-5 w-5 text-white/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Tier summary (collapsed) */}
      {!expanded && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-14 text-xs text-white/55">
          {tiered ? (
            a.tiers.map((t, i) => (
              <span key={i} className="tabular-nums">
                {ACHIEVEMENT_TIER_EMOJI[tierAt(i)]} {ACHIEVEMENT_TIER_LABELS[tierAt(i)]}{' '}
                <span className="font-mono text-white/70">{t.threshold.toLocaleString('en-US')}</span>
              </span>
            ))
          ) : (
            <span className="font-mono text-white/70">
              {a.tiers[0]?.threshold.toLocaleString('en-US')} {unit}
            </span>
          )}
        </div>
      )}

      {/* Editor (expanded) */}
      {expanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                className={inputClass}
                maxLength={100}
                value={a.name}
                onChange={(e) => onPatch({ name: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <div className="relative">
                <select
                  className={selectClass}
                  value={a.type}
                  onChange={(e) => onPatch({ type: e.target.value as Achievement['type'] })}
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
          </div>
          <Field label="Description" hint="Optional.">
            <input
              className={inputClass}
              maxLength={200}
              value={a.description ?? ''}
              onChange={(e) => onPatch({ description: e.target.value || undefined })}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {tiered ? 'Tiers' : 'Threshold & rewards'}
            </p>
            {a.tiers.map((tier, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-white/80">
                    {tiered
                      ? `${ACHIEVEMENT_TIER_EMOJI[tierAt(i)]} ${ACHIEVEMENT_TIER_LABELS[tierAt(i)]}`
                      : 'Requirement'}
                  </span>
                  {tiered && a.tiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveTier(i)}
                      className="text-white/40 hover:text-[var(--color-danger)]"
                      aria-label="Remove tier"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={`Threshold${unit ? ` (${unit})` : ''}`}>
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      value={tier.threshold}
                      onChange={(e) =>
                        onPatchTier(i, { threshold: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </Field>
                  <Field label="Reward role" hint="Optional.">
                    <RoleSelect
                      roles={roles}
                      placeholder="None"
                      selected={tier.rewardRoleId ? [tier.rewardRoleId] : []}
                      onChange={(ids) => onPatchTier(i, { rewardRoleId: ids[0] ?? null })}
                    />
                  </Field>
                  <Field label="Reward XP">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={tier.rewardXp}
                      onChange={(e) =>
                        onPatchTier(i, { rewardXp: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
            {tiered && a.tiers.length < 4 && (
              <button
                type="button"
                onClick={onAddTier}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-[var(--color-brand)]/50 hover:text-white/90"
              >
                <Plus className="h-3.5 w-3.5" /> Add tier
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/60 transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete achievement
          </button>
        </div>
      )}
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
