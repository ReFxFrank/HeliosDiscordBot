import { Check, Crown } from 'lucide-react';
import { prisma } from '@solari/database';
import { LIFETIME_STATUS, PREMIUM_PERKS, tierFromSubscription } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { startCheckout, openBillingPortal } from '../../../../lib/billing';
import { canManageBilling } from '../../../../lib/billing-access';
import { isBillingConfigured } from '../../../../lib/stripe';
import { PRICING_TIERS, tierEnabled } from '../../../../lib/pricing';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function PremiumPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upgraded?: string; billing_error?: string }>;
}) {
  const { id } = await params;
  const { upgraded, billing_error: billingError } = await searchParams;
  const { session } = await guardGuildAccess(id);

  const [sub, guild] = await Promise.all([
    prisma.guildSubscription.findUnique({ where: { guildId: id } }),
    prisma.guild.findUnique({ where: { id }, select: { premiumTier: true } }),
  ]);
  // Paid premium comes from a live Stripe subscription; granted premium is the
  // bot owner setting Guild.premiumTier from the admin panel (no sub row).
  // Granted servers get the active state with no billing surface at all.
  const paidPremium = tierFromSubscription(sub?.status, sub?.currentPeriodEnd ?? null) === 'PREMIUM';
  const isPremium = paidPremium || guild?.premiumTier === 'PREMIUM';
  const granted = isPremium && !paidPremium;
  const lifetime = sub?.status === LIFETIME_STATUS;
  const configured = isBillingConfigured();
  // Billing details are private to the purchaser (and the bot owner) — other
  // guild admins only see that Premium is active. Lifetime has no recurring
  // billing to manage, so no portal button.
  const showBilling = paidPremium && !lifetime && canManageBilling(session, sub?.purchasedBy);
  const plans = PRICING_TIERS.filter(tierEnabled);

  const renews = sub?.currentPeriodEnd
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(sub.currentPeriodEnd)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white/90">
          <Crown className="h-5 w-5 text-amber-300" /> Premium
        </h2>
        <p className="text-sm text-white/50">
          Unlock the premium modules and higher limits for this server.
        </p>
      </div>

      {upgraded && (
        <GlassCard className="border-[var(--color-success)]/30 p-4">
          <p className="text-sm text-[var(--color-success)]">
            Thanks for upgrading! Premium activates the moment Stripe confirms the payment.
          </p>
        </GlassCard>
      )}

      {billingError && (
        <GlassCard className="border-[var(--color-danger)]/30 p-4">
          <p className="text-sm text-[var(--color-danger)]">
            {billingError === 'portal'
              ? 'We couldn’t open the billing portal. If you’re the operator, activate it in Stripe → Settings → Billing → Customer portal, then try again.'
              : 'We couldn’t start checkout for that plan. If you’re the operator, check that its Stripe price is set up correctly — Monthly and Yearly must be recurring prices and Lifetime a one-time price, with price IDs that match your live keys. The exact reason is in the web server logs.'}
          </p>
        </GlassCard>
      )}

      <GlassCard className="p-5">
        {isPremium ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                <Crown className="h-3.5 w-3.5" /> Premium active
              </span>
              {sub?.cancelAtPeriodEnd && (
                <span className="text-xs text-white/50">Cancels at period end</span>
              )}
            </div>
            {granted ? (
              <p className="text-sm text-white/50">
                Premium is enabled for this server — every premium module is unlocked. Nothing to
                manage.
              </p>
            ) : lifetime ? (
              <p className="text-sm text-white/50">
                🎉 <strong className="text-white/80">Lifetime Premium</strong> is active on this
                server — every premium module is unlocked, forever. Nothing to renew.
              </p>
            ) : showBilling ? (
              <>
                {renews && (
                  <p className="text-sm text-white/60">
                    {sub?.cancelAtPeriodEnd ? 'Access until' : 'Renews'} <strong>{renews}</strong>.
                  </p>
                )}
                <form action={openBillingPortal.bind(null, id)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06]"
                  >
                    Manage billing
                  </button>
                </form>
              </>
            ) : (
              <p className="text-sm text-white/50">
                Billing for this server is managed privately by the member who purchased Premium.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {PREMIUM_PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-sm text-white/80">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />
                  {perk}
                </li>
              ))}
            </ul>
            {configured ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {plans.map((tier) => (
                  <form
                    key={tier.id}
                    action={startCheckout.bind(null, id, tier.id)}
                    className="flex"
                  >
                    <div
                      className={`flex w-full flex-col gap-2 rounded-xl border p-4 ${
                        tier.highlighted
                          ? 'border-amber-300/40 bg-amber-300/[0.06]'
                          : 'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white/90">{tier.name}</span>
                        {tier.badge && (
                          <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            {tier.badge}
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-white">{tier.price}</span>
                        <span className="text-xs text-white/50">{tier.period}</span>
                      </div>
                      {tier.billed && (
                        <p className="text-xs font-medium text-white/70">{tier.billed}</p>
                      )}
                      <p className="text-xs text-white/45">{tier.blurb}</p>
                      <button
                        type="submit"
                        className="mt-1 rounded-lg bg-amber-300 px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-amber-200"
                      >
                        Choose {tier.name}
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/40">
                Billing isn’t configured on this instance — set the <code>STRIPE_*</code> environment
                variables to enable upgrades.
              </p>
            )}
            {configured && (
              <p className="text-xs text-white/40">
                Secure checkout by Stripe · cancel anytime ·{' '}
                <a href="/refund" className="underline-offset-2 hover:text-white/70 hover:underline">
                  Refund policy
                </a>
              </p>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
