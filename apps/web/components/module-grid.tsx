'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, ToggleLeft, ToggleRight } from 'lucide-react';
import { MODULE_META, groupedModuleMeta, type ModuleCategory } from '../lib/modules';
import { setAllModulesEnabled } from '../lib/config-actions';
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
  const [bulkPending, startBulk] = useTransition();
  const router = useRouter();

  function bulkToggle(nextEnabled: boolean): void {
    if (
      !nextEnabled &&
      !window.confirm('Turn off ALL modules for this server? Their settings are kept.')
    ) {
      return;
    }
    startBulk(async () => {
      // Idempotent server-side: already-matching modules are skipped, premium
      // stays locked on free servers, globally-disabled modules are untouched.
      await setAllModulesEnabled(guildId, nextEnabled).catch(() => undefined);
      router.refresh(); // reflect every card's new state without a manual refresh
    });
  }

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
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => bulkToggle(true)}
            disabled={bulkPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/90 disabled:opacity-50"
          >
            <ToggleRight className="h-3.5 w-3.5" /> Enable all
          </button>
          <button
            type="button"
            onClick={() => bulkToggle(false)}
            disabled={bulkPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/90 disabled:opacity-50"
          >
            <ToggleLeft className="h-3.5 w-3.5" /> Disable all
          </button>
        </div>
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
