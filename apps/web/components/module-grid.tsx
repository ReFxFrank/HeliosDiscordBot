'use client';

import { useMemo, useState } from 'react';
import { Crown } from 'lucide-react';
import { MODULE_META, groupedModuleMeta, type ModuleCategory } from '../lib/modules';
import { cn } from '../lib/utils';
import { ModuleCard } from './module-card';

type Filter = 'all' | ModuleCategory;

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'core', label: 'Core' },
  { key: 'premium', label: 'Premium' },
  { key: 'utility', label: 'Utility' },
];

function countFor(key: Filter): number {
  return key === 'all' ? MODULE_META.length : MODULE_META.filter((m) => m.category === key).length;
}

export function ModuleGrid({
  guildId,
  enabled,
  isPremium,
  disabledModules = [],
}: {
  guildId: string;
  /** module key -> enabled. Plain object so it serializes across the server boundary. */
  enabled: Record<string, boolean>;
  isPremium: boolean;
  /** Modules the owner has globally disabled — hidden from the grid entirely. */
  disabledModules?: string[];
}) {
  const [filter, setFilter] = useState<Filter>('all');

  // Cards render grouped MEE6-style: for each group, its cards under a heading.
  // The active filter narrows each group's cards; empty groups drop out. Modules
  // the owner globally disabled are hidden, so users never see or reach them.
  const groups = useMemo(() => {
    const off = new Set(disabledModules);
    return groupedModuleMeta()
      .map((entry) => ({
        ...entry,
        modules: entry.modules.filter(
          (m) => !off.has(m.module) && (filter === 'all' || m.category === filter),
        ),
      }))
      .filter((entry) => entry.modules.length > 0);
  }, [filter, disabledModules]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] pb-3">
        {TABS.map((t) => {
          const active = filter === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-[var(--color-brand-strong)] text-white shadow-[0_6px_16px_-8px_var(--color-brand-strong)]'
                  : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85',
              )}
            >
              {t.key === 'premium' && <Crown className="h-3.5 w-3.5" />}
              {t.label}
              <span className={cn('text-xs tabular-nums', active ? 'text-white/70' : 'text-white/30')}>
                {countFor(t.key)}
              </span>
            </button>
          );
        })}
      </div>

      {groups.map(({ group, modules }) => (
        <div key={group} className="flex flex-col gap-3.5">
          <h3 className="text-sm font-semibold text-white/80">{group}</h3>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((meta) => (
              <ModuleCard
                key={meta.module}
                guildId={guildId}
                meta={meta}
                enabled={enabled[meta.module] ?? false}
                locked={meta.category === 'premium' && !isPremium}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
