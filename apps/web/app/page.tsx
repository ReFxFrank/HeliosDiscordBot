import Link from 'next/link';
import { ArrowRight, Check, Crown, Zap } from 'lucide-react';
import { BRAND } from '@helios/shared';
import { auth } from '../auth';
import { botInviteUrl } from '../lib/invite';
import { PREMIUM_FEATURES } from '../lib/pricing';
import { MODULE_META } from '../lib/modules';
import { UrgencyBanner } from '../components/marketing/urgency-banner';
import { SiteNav } from '../components/marketing/site-nav';
import { SiteFooter } from '../components/marketing/site-footer';

export const dynamic = 'force-dynamic';

const FEATURED = [
  'MODERATION',
  'AUTOMOD',
  'LEVELING',
  'WELCOME',
  'TICKETS',
  'STARBOARD',
  'GIVEAWAYS',
  'MUSIC',
  'ECONOMY',
] as const;

export default async function HomePage() {
  const session = await auth();
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';
  const invite = botInviteUrl(clientId);
  const moduleCount = MODULE_META.length;
  const featured = FEATURED.map((key) => MODULE_META.find((m) => m.module === key)).filter(
    (m): m is (typeof MODULE_META)[number] => Boolean(m),
  );

  return (
    <div className="min-h-screen">
      <UrgencyBanner />
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[820px] max-w-[95vw] -translate-x-1/2 rounded-full bg-[var(--color-brand)]/20 blur-[120px]"
        />
        <div className="relative mx-auto max-w-3xl py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60">
            <Zap className="h-3.5 w-3.5 text-[var(--color-brand-bright)]" /> {moduleCount} modules · config
            live in under a second
          </span>
          <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight text-white sm:text-6xl">
            The complete Discord bot for your community
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-white/60">
            {BRAND.name} does it all — moderation, leveling, tickets, music, economy and more —
            managed from one fast dashboard. Every change goes live instantly.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a
              href={invite}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-strong)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85"
            >
              Add to Discord <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href={session?.user ? '/servers' : '/pricing'}
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06]"
            >
              {session?.user ? 'Open dashboard' : 'See features'}
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/40">
            <span>Free to use</span>
            <span>·</span>
            <span>No ads</span>
            <span>·</span>
            <span>Slash commands + dashboard</span>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold text-white/90">
            Everything your server needs
          </h2>
          <p className="mt-2 text-center text-sm text-white/50">
            One bot instead of ten. Toggle what you want from the dashboard.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((m) => {
              const Icon = m.icon;
              const premium = m.category === 'premium';
              return (
                <div
                  key={m.module}
                  className="relative rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]"
                >
                  {premium && (
                    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      <Crown className="h-3 w-3" /> PREMIUM
                    </span>
                  )}
                  <Icon className="h-6 w-6 text-[var(--color-brand)]" />
                  <h3 className="mt-3 font-medium text-white/90">{m.name}</h3>
                  <p className="mt-1 text-sm text-white/50">{m.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Premium teaser */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.07] via-transparent to-[var(--color-brand)]/[0.07] p-10">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300">
                <Crown className="h-4 w-4" /> {BRAND.name} Premium
              </span>
              <h2 className="mt-3 text-3xl font-bold text-white">Take your server further</h2>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {PREMIUM_FEATURES.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-white/75">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-200"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
