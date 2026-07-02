'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Gamepad2,
  LifeBuoy,
  Loader2,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { SETUP_PRESETS, type SetupPreset } from '../lib/setup-presets';
import { applySetupPreset, dismissSetup } from '../lib/setup-actions';
import { SpotlightCard } from './marketing/spotlight-card';
import { cn } from '../lib/utils';

const PRESET_ICONS: Record<SetupPreset['icon'], LucideIcon> = {
  Users,
  Gamepad2,
  LifeBuoy,
  Sparkles,
};

// Discord names can embed Unicode directional-override characters (e.g. U+202E),
// which visually reverse the surrounding text — strip them so the name reads
// correctly and can't flip the rest of the heading. Covers the bidi embeddings/
// overrides (U+202A–U+202E), isolates (U+2066–U+2069), marks (U+200E/200F) and
// the Arabic letter mark (U+061C).
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;
function cleanName(name: string): string {
  return name.replace(BIDI_CONTROLS, '').trim() || 'your server';
}

/**
 * First-run quick-setup wizard shown on the server overview until the owner
 * picks a preset or skips (both persist `setupCompletedAt`, so it never nags
 * again). Each card applies a curated bundle of modules with the bot's own
 * defaults; the grid below then reflects the result after revalidation.
 */
export function QuickSetup({ guildId, guildName }: { guildId: string; guildName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Which action is in flight, so we can spin only that card / the skip link.
  const [active, setActive] = useState<string | null>(null);

  function apply(key: string): void {
    if (pending) return;
    setActive(key);
    startTransition(async () => {
      await applySetupPreset(guildId, key).catch(() => undefined);
      setActive(null);
      // Re-fetch the overview so the wizard closes and the grid reflects the
      // newly-enabled modules without a manual refresh.
      router.refresh();
    });
  }

  function skip(): void {
    if (pending) return;
    setActive('__skip');
    startTransition(async () => {
      await dismissSetup(guildId).catch(() => undefined);
      setActive(null);
      router.refresh();
    });
  }

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-[var(--color-brand)]/25 p-6 sm:p-8"
      style={{
        background:
          'linear-gradient(120deg, rgba(139,92,246,0.16), rgba(217,70,239,0.10) 55%, rgba(10,8,16,0) 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[var(--color-brand)]/25 blur-3xl"
      />

      <button
        type="button"
        onClick={skip}
        disabled={pending}
        aria-label="Skip setup"
        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-50"
      >
        {active === '__skip' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </button>

      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-strong)]/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
          <Sparkles className="h-3.5 w-3.5" /> Quick setup
        </span>
        <h2 className="mt-3 text-2xl font-bold leading-tight text-white sm:text-[1.75rem]">
          Welcome to Solari — let&rsquo;s set up{' '}
          <bdi className="text-[var(--color-brand-bright)]">{cleanName(guildName)}</bdi>
        </h2>
        <p className="mt-2.5 max-w-2xl text-pretty text-sm leading-relaxed text-white/75 sm:text-[15px]">
          Pick a starting point and we&rsquo;ll turn on a sensible bundle of modules with smart
          defaults. You can fine-tune everything below afterward — nothing here is permanent.
        </p>

        <div className="mt-6 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {SETUP_PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.icon];
            const isActive = active === preset.key;
            return (
              <SpotlightCard
                key={preset.key}
                className={cn(
                  'glass rounded-2xl border border-white/10 transition-all duration-200',
                  'hover:-translate-y-0.5 hover:border-[var(--color-brand)]/40',
                  pending && !isActive && 'opacity-50',
                )}
              >
                <button
                  type="button"
                  onClick={() => apply(preset.key)}
                  disabled={pending}
                  className="group flex h-full w-full flex-col gap-3 rounded-2xl p-4 text-left disabled:cursor-not-allowed"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-strong)]/25 text-[var(--color-brand-bright)] ring-1 ring-[var(--color-brand)]/30">
                    {isActive ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 text-base font-semibold text-white">
                      {preset.name}
                      <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-white/50 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-white/70">{preset.tagline}</p>
                  </div>
                </button>
              </SpotlightCard>
            );
          })}
        </div>

        <button
          type="button"
          onClick={skip}
          disabled={pending}
          className="mt-4 text-sm font-medium text-white/55 transition-colors hover:text-white/85 disabled:opacity-50"
        >
          Skip for now — I&rsquo;ll configure modules myself
        </button>
      </div>
    </section>
  );
}
