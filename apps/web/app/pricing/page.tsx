import Link from 'next/link';
import { Check, Crown, ShieldCheck } from 'lucide-react';
import { BRAND } from '@solari/shared';
import { PREMIUM_FEATURES, PRICING_TIERS, tierEnabled } from '../../lib/pricing';
import { UrgencyBanner } from '../../components/marketing/urgency-banner';
import { SiteNav } from '../../components/marketing/site-nav';
import { SiteFooter } from '../../components/marketing/site-footer';
import { Reveal } from '../../components/marketing/reveal';
import { SpotlightCard } from '../../components/marketing/spotlight-card';

export const dynamic = 'force-dynamic';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is Premium per server?',
    a: `Yes — a Premium subscription upgrades one specific server. You pick the server in the dashboard and check out for it.`,
  },
  {
    q: 'How do I upgrade?',
    a: `Open the dashboard, choose your server, and hit the Premium tab. Checkout is handled securely by Stripe.`,
  },
  {
    q: 'Can I cancel anytime?',
    a: `Absolutely. Manage or cancel from the billing portal in one click — you keep Premium until the end of the period.`,
  },
  {
    q: 'What happens when it lapses?',
    a: `Nothing breaks. Premium modules simply lock again and your free features keep working exactly as before.`,
  },
];

export default function PricingPage() {
  const tiers = PRICING_TIERS.map((t) => ({ ...t, enabled: tierEnabled(t) }));

  return (
    <div className="min-h-screen">
      <UrgencyBanner />
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-aurora absolute left-1/2 top-[-40%] h-[360px] w-[720px] max-w-[95vw] rounded-full bg-amber-300/10 blur-[130px]" />
          <div
            className="animate-aurora absolute left-[30%] top-[-10%] h-[260px] w-[420px] rounded-full bg-[var(--color-brand)]/15 blur-[120px]"
            style={{ animationDelay: '-6s' }}
          />
        </div>
        <div className="relative">
          <span
            className="enter inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300"
            style={{ animationDelay: '0ms' }}
          >
            <Crown className="h-4 w-4" /> {BRAND.name} Premium
          </span>
          <h1
            className="enter mx-auto mt-4 max-w-2xl text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl"
            style={{ animationDelay: '90ms' }}
          >
            Take your server to the <span className="text-gradient">next level</span>
          </h1>
          <p
            className="enter mx-auto mt-4 max-w-lg text-pretty text-white/60"
            style={{ animationDelay: '180ms' }}
          >
            Unlock every premium module and higher limits. Simple per-server pricing, cancel
            anytime.
          </p>
          <p
            className="enter mt-4 text-xs font-medium uppercase tracking-widest text-amber-300/80"
            style={{ animationDelay: '270ms' }}
          >
            Limited-time launch pricing
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="px-6 py-12">
        <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-3">
          {tiers.map((tier) => (
            <SpotlightCard
              key={tier.id}
              className={`lift relative flex flex-col rounded-2xl border p-6 ${
                tier.highlighted
                  ? 'border-amber-300/40 bg-amber-300/[0.04] shadow-[0_0_40px_-15px] shadow-amber-300/30 sm:-mt-3 sm:mb-3'
                  : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-black">
                  {tier.badge}
                </span>
              )}
              <h3 className="text-lg font-semibold text-white/90">{tier.name}</h3>
              <div className="mt-3 flex items-end gap-1.5">
                <span className="text-4xl font-bold text-white">{tier.price}</span>
                <span className="pb-1 text-sm text-white/50">{tier.period}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                {tier.original && <span className="text-white/40 line-through">{tier.original}</span>}
                {tier.save && (
                  <span className="rounded bg-[var(--color-success)]/15 px-1.5 py-0.5 text-xs font-semibold text-[var(--color-success)]">
                    {tier.save}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-white/50">{tier.blurb}</p>

              {tier.enabled ? (
                <Link
                  href="/servers"
                  className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                    tier.highlighted
                      ? 'btn-shine bg-amber-300 text-black hover:bg-amber-200'
                      : 'btn-shine bg-white/[0.06] text-white/90 hover:bg-white/[0.1]'
                  }`}
                >
                  Get {tier.name}
                </Link>
              ) : (
                <span className="mt-6 cursor-default rounded-lg border border-white/10 px-4 py-2.5 text-center text-sm font-medium text-white/40">
                  Coming soon
                </span>
              )}
            </SpotlightCard>
          ))}
        </div>

        {/* Feature checklist */}
        <Reveal className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <p className="text-sm font-semibold text-white/80">Every plan includes:</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {PREMIUM_FEATURES.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-sm text-white/75">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                {perk}
              </li>
            ))}
          </ul>
        </Reveal>

        {/* Risk reversal */}
        <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/45">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-success)]" /> Secure checkout by
            Stripe
          </span>
          <span>· Cancel anytime</span>
          <span>· No hidden fees</span>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-2xl font-semibold text-white/90">Questions</h2>
          <div className="mt-8 flex flex-col gap-3">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <p className="font-medium text-white/90">{item.q}</p>
                <p className="mt-1.5 text-sm text-white/55">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
