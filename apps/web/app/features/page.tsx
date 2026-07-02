import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Crown, Zap } from 'lucide-react';
import { BRAND } from '@solari/shared';
import { botInviteUrl } from '../../lib/invite';
import { MODULE_META, groupedModuleMeta } from '../../lib/modules';
import { UrgencyBanner } from '../../components/marketing/urgency-banner';
import { SiteNav } from '../../components/marketing/site-nav';
import { SiteFooter } from '../../components/marketing/site-footer';
import { Reveal } from '../../components/marketing/reveal';
import { SpotlightCard } from '../../components/marketing/spotlight-card';
import { Marquee } from '../../components/marketing/marquee';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Features',
  description: `Every ${BRAND.name} module — moderation, leveling, economy, music, giveaways and more, grouped exactly like the dashboard.`,
};

export default function FeaturesPage() {
  const groups = groupedModuleMeta();
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';
  const invite = botInviteUrl(clientId);

  return (
    <div className="min-h-screen">
      <UrgencyBanner />
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-aurora absolute left-1/2 top-[-30%] h-[380px] w-[760px] max-w-[95vw] rounded-full bg-[var(--color-brand)]/20 blur-[130px]" />
        </div>
        <div className="relative mx-auto max-w-3xl pb-10 pt-20 text-center">
          <span
            className="enter inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60"
            style={{ animationDelay: '0ms' }}
          >
            <Zap className="h-3.5 w-3.5 text-[var(--color-brand-bright)]" /> {MODULE_META.length}{' '}
            modules · toggle each per server
          </span>
          <h1
            className="enter mt-6 text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl"
            style={{ animationDelay: '90ms' }}
          >
            Every feature. <span className="text-gradient">One bot.</span>
          </h1>
          <p
            className="enter mx-auto mt-4 max-w-xl text-pretty text-white/60"
            style={{ animationDelay: '180ms' }}
          >
            The full catalog, grouped exactly like the dashboard. Switch on what your community
            needs — every setting lives in the web panel and goes live in about a second.
          </p>
        </div>
      </section>

      {/* Module marquee */}
      <div className="pb-4">
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
      </div>

      {/* Grouped catalog */}
      <section className="px-6 py-12">
        <div className="mx-auto flex max-w-5xl flex-col gap-12">
          {groups.map((entry) => (
            <div key={entry.group}>
              <Reveal>
                <h2 className="mb-1 text-xl font-semibold text-white/90">{entry.group}</h2>
                <p className="mb-5 text-sm text-white/45">
                  {entry.modules.length} {entry.modules.length === 1 ? 'module' : 'modules'}
                </p>
              </Reveal>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entry.modules.map((m, index) => {
                  const Icon = m.icon;
                  const premium = m.category === 'premium';
                  return (
                    <Reveal key={m.module} delay={index * 50}>
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
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-6 pb-20 pt-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
            See how each one works
          </h2>
          <p className="mx-auto mt-2 max-w-md text-white/55">
            The wiki has a setup guide for every module, and the command reference lists every
            slash command.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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
              href="/docs"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06]"
            >
              Open the wiki
            </Link>
            <Link
              href="/commands"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06]"
            >
              Commands
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
