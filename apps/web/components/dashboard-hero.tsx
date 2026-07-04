import Link from 'next/link';
import { ArrowRight, Crown, Lock, Sparkles } from 'lucide-react';
import { MODULE_ACCENTS, MODULE_META } from '../lib/modules';

/**
 * Top-of-dashboard hero banner (MEE6-style). Free servers get a premium upsell
 * with a live preview of the locked modules; premium servers get a branded
 * "active" banner.
 */
export function DashboardHero({
  guildId,
  isPremium,
  guildName,
}: {
  guildId: string;
  isPremium: boolean;
  guildName: string;
}) {
  if (isPremium) {
    return (
      <section
        className="premium-glow relative overflow-hidden rounded-3xl border border-[var(--color-premium)]/25 p-7 sm:p-8"
        style={{
          background:
            'linear-gradient(120deg, rgba(245,196,81,0.12), rgba(139,92,246,0.12) 55%, rgba(217,70,239,0.06) 100%)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--color-premium)]/20 blur-3xl"
        />
        <div className="relative flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-premium)]/15 text-[var(--color-premium)] ring-1 ring-[var(--color-premium)]/30">
            <Crown className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-premium)]">
              Premium active
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
              {guildName} has everything unlocked
            </h2>
            <p className="mt-1 text-sm text-white/75">
              Every premium module is available. Manage your plan anytime from billing.
            </p>
          </div>
          <Link
            href={`/servers/${guildId}/premium`}
            className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-premium)]/30 px-4 py-2 text-sm font-semibold text-[var(--color-premium)] transition-colors hover:bg-[var(--color-premium)]/10 sm:inline-flex"
          >
            Manage plan <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    );
  }

  const preview = MODULE_META.filter((m) => m.category === 'premium').slice(0, 4);

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 p-7 sm:p-8"
      style={{
        background:
          'linear-gradient(120deg, rgba(139,92,246,0.20), rgba(217,70,239,0.14) 55%, rgba(10,8,16,0) 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[var(--color-brand)]/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-10 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-fuchsia-500/15 blur-3xl"
      />

      <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-premium)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-premium)]">
            <Crown className="h-3.5 w-3.5" /> Solari Premium
          </span>
          <h2 className="mt-3 text-2xl font-bold leading-tight text-white sm:text-3xl">
            Give your community the full experience
          </h2>
          <p className="mt-2 text-pretty text-sm text-white/80 sm:text-base">
            Unlock Music, Economy, Social Alerts, Temp Voice and higher limits — one
            subscription, every premium module, on your own server.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/servers/${guildId}/premium`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-premium)] px-5 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
            >
              <Sparkles className="h-4 w-4" /> Upgrade to Premium
            </Link>
            <Link
              href={`/servers/${guildId}/premium`}
              className="text-sm font-medium text-white/75 transition-colors hover:text-white"
            >
              See everything included →
            </Link>
          </div>
        </div>

        {/* Preview of what Premium unlocks — mirrors MEE6's product panel. */}
        <div className="glass w-full shrink-0 rounded-2xl p-4 lg:w-72">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Included in Premium
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {preview.map((m) => {
              const Icon = m.icon;
              const [from, to] = MODULE_ACCENTS[m.accent];
              return (
                <div
                  key={m.module}
                  className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                    style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </span>
                  <span className="truncate text-sm font-medium text-white/80">{m.name}</span>
                  <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--color-premium)]/70" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
