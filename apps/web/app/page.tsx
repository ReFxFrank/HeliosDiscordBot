import Link from 'next/link';
import { ArrowRight, Check, Crown, Zap } from 'lucide-react';
import { BRAND } from '@solari/shared';
import { auth } from '../auth';
import { botInviteUrl } from '../lib/invite';
import { PREMIUM_FEATURES } from '../lib/pricing';
import { MODULE_META } from '../lib/modules';
import { getApplicationCommands } from '../lib/discord-commands';
import { UrgencyBanner } from '../components/marketing/urgency-banner';
import { SiteNav } from '../components/marketing/site-nav';
import { SiteFooter } from '../components/marketing/site-footer';
import { Reveal } from '../components/marketing/reveal';
import { DashboardPreview } from '../components/marketing/dashboard-preview';
import { CountUp } from '../components/marketing/count-up';
import { SpotlightCard } from '../components/marketing/spotlight-card';
import { Marquee } from '../components/marketing/marquee';
import { Tilt } from '../components/marketing/tilt';

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
  const [session, commands] = await Promise.all([auth(), getApplicationCommands()]);
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';
  const invite = botInviteUrl(clientId);
  const moduleCount = MODULE_META.length;
  // Live command count (top-level + subcommands); 0 when Discord is unreachable.
  const commandCount = (commands ?? []).reduce(
    (sum, command) => sum + Math.max(1, command.subcommands.length),
    0,
  );
  const featured = FEATURED.map((key) => MODULE_META.find((m) => m.module === key)).filter(
    (m): m is (typeof MODULE_META)[number] => Boolean(m),
  );

  return (
    <div className="min-h-screen">
      <UrgencyBanner />
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-6">
        {/* Animated aurora backdrop — Solari's signature violet glow. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-aurora absolute left-1/2 top-[-12%] h-[440px] w-[860px] max-w-[95vw] rounded-full bg-[var(--color-brand)]/25 blur-[130px]" />
          <div
            className="animate-aurora absolute left-[28%] top-[6%] h-[320px] w-[520px] rounded-full bg-fuchsia-500/15 blur-[120px]"
            style={{ animationDelay: '-5s', animationDuration: '18s' }}
          />
          <div
            className="animate-float absolute right-[14%] top-[22%] hidden h-24 w-24 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md md:block"
            style={{ animationDelay: '-2s' }}
          />
          <div
            className="animate-float absolute left-[12%] top-[38%] hidden h-16 w-16 rounded-full border border-white/10 bg-[var(--color-brand)]/10 backdrop-blur-md md:block"
            style={{ animationDelay: '-4s' }}
          />
        </div>

        <div className="relative mx-auto max-w-3xl py-24 text-center">
          <span
            className="enter inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60"
            style={{ animationDelay: '0ms' }}
          >
            <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
            <Zap className="h-3.5 w-3.5 text-[var(--color-brand-bright)]" /> {moduleCount} modules ·
            config live in under a second
          </span>
          <h1
            className="enter mt-6 text-balance text-5xl font-bold tracking-tight text-white sm:text-6xl"
            style={{ animationDelay: '90ms' }}
          >
            The <span className="text-gradient">complete</span> Discord bot for your community
          </h1>
          <p
            className="enter mx-auto mt-5 max-w-xl text-pretty text-lg text-white/60"
            style={{ animationDelay: '180ms' }}
          >
            {BRAND.name} does it all — moderation, leveling, tickets, music, economy and more —
            managed from one fast dashboard. Every change goes live instantly.
          </p>
          <div
            className="enter mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: '270ms' }}
          >
            <a
              href={invite}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-shine group inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-strong)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--color-brand)]/20 transition-all hover:scale-[1.03] hover:bg-[var(--color-brand-strong)]/85"
            >
              Add to Discord{' '}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <Link
              href={session?.user ? '/servers' : '/pricing'}
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06]"
            >
              {session?.user ? 'Open dashboard' : 'See features'}
            </Link>
          </div>
          <div
            className="enter mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/40"
            style={{ animationDelay: '360ms' }}
          >
            <span>Free to use</span>
            <span>·</span>
            <span>No ads</span>
            <span>·</span>
            <span>Slash commands + dashboard</span>
          </div>
          <div className="enter mt-14" style={{ animationDelay: '450ms' }}>
            <Tilt>
              <DashboardPreview />
            </Tilt>
          </div>
        </div>
      </section>

      {/* Live numbers */}
      <section className="px-6 pb-2">
        <Reveal className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { value: <CountUp to={moduleCount} suffix="" />, label: 'modules, one bot' },
            commandCount > 0
              ? { value: <CountUp to={commandCount} suffix="+" />, label: 'slash commands' }
              : null,
            { value: <>&lt;1s</>, label: 'dashboard → live bot' },
            { value: <>24/7</>, label: 'always on' },
          ]
            .filter((stat): stat is NonNullable<typeof stat> => stat !== null)
            .map((stat, index) => (
              <div key={index} className="glass rounded-2xl p-5 text-center">
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="mt-1 text-xs text-white/45">{stat.label}</p>
              </div>
            ))}
        </Reveal>
      </section>

      {/* Module marquee */}
      <section className="py-10">
        <Marquee>
          {MODULE_META.map((m) => {
            const Icon = m.icon;
            return (
              <span
                key={m.module}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65"
              >
                <Icon className="h-4 w-4 text-[var(--color-brand-bright)]" />
                {m.name}
              </span>
            );
          })}
        </Marquee>
      </section>

      {/* How it works */}
      <section className="px-6 pt-4">
        <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
          {[
            { step: '1', title: 'Add to Discord', text: 'One click, standard OAuth — no downloads, nothing to host.' },
            { step: '2', title: 'Pick your modules', text: 'Turn on what your server needs from the dashboard; ignore the rest.' },
            { step: '3', title: 'It’s already live', text: 'Every setting you save reaches the bot in about a second.' },
          ].map((item, i) => (
            <Reveal key={item.step} delay={i * 80}>
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-brand)]/20 text-sm font-bold text-[var(--color-brand-bright)]">
                  {item.step}
                </span>
                <h3 className="mt-3 font-medium text-white/90">{item.title}</h3>
                <p className="mt-1 text-sm text-white/50">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold text-white/90">
              Everything your server needs
            </h2>
            <p className="mt-2 text-center text-sm text-white/50">
              One bot instead of ten. Toggle what you want from the dashboard.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((m, i) => {
              const Icon = m.icon;
              const premium = m.category === 'premium';
              return (
                <Reveal key={m.module} delay={i * 60}>
                  <SpotlightCard className="lift group relative h-full rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-[var(--color-brand)]/30 hover:bg-white/[0.04]">
                    {premium && (
                      <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        <Crown className="h-3 w-3" /> PREMIUM
                      </span>
                    )}
                    <Icon className="h-6 w-6 text-[var(--color-brand)] transition-transform group-hover:scale-110" />
                    <h3 className="mt-3 font-medium text-white/90">{m.name}</h3>
                    <p className="mt-1 text-sm text-white/50">{m.description}</p>
                  </SpotlightCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Premium teaser */}
      <section className="px-6 py-16">
        <Reveal className="mx-auto max-w-4xl">
          <div className="premium-glow overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.07] via-transparent to-[var(--color-brand)]/[0.07] p-10">
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
              className="btn-shine shrink-0 rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-200"
            >
              View pricing
            </Link>
          </div>
          </div>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden px-6 py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-aurora absolute left-1/2 top-[30%] h-[300px] w-[640px] max-w-[95vw] rounded-full bg-[var(--color-brand)]/20 blur-[120px]" />
        </div>
        <Reveal className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to give your server <span className="text-gradient">everything</span>?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/55">
            Free to add, set up in minutes, and every change goes live instantly.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href={invite}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-shine group inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-strong)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--color-brand)]/25 transition-all hover:scale-[1.03] hover:bg-[var(--color-brand-strong)]/85"
            >
              Add {BRAND.name} to Discord{' '}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <Link
              href="/docs"
              className="rounded-full border border-white/15 px-7 py-3.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06]"
            >
              Read the docs
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
