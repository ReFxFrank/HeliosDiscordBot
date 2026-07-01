/**
 * Marketing pricing tiers (§3). Display copy for the public pricing page +
 * in-dashboard upgrade. A tier is "live" only when its Stripe price env var is
 * set — so Yearly/Lifetime light up automatically once you add those prices.
 *
 * NOTE: the displayed prices are marketing copy — keep them in sync with the
 * actual amounts on your Stripe prices.
 */

export interface PricingTier {
  id: 'monthly' | 'yearly' | 'lifetime';
  name: string;
  /** Large displayed price, e.g. "$4.99". */
  price: string;
  /** Period suffix, e.g. "/mo", "one-time". */
  period: string;
  /** Strikethrough anchor price, if discounted. */
  original?: string;
  /** e.g. "Save 50%". */
  save?: string;
  /** e.g. "Most Popular" / "Best value". */
  badge?: string;
  highlighted?: boolean;
  blurb: string;
  /** Env var holding the Stripe price id; unset => tier shows "Coming soon". */
  priceEnvKey: 'STRIPE_PREMIUM_PRICE_ID' | 'STRIPE_YEARLY_PRICE_ID' | 'STRIPE_LIFETIME_PRICE_ID';
}

export const PREMIUM_FEATURES: readonly string[] = [
  'Music — queues, filters, DJ roles & vote-skip',
  'Economy — currency, games, shop & inventory',
  'Social Alerts — Twitch, YouTube, Reddit, Bluesky & RSS',
  'Temp Voice — join-to-create voice channels',
  'Higher limits across every module',
  'Priority support',
];

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$4.99',
    period: '/mo',
    blurb: 'Flexible — cancel anytime.',
    priceEnvKey: 'STRIPE_PREMIUM_PRICE_ID',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: '$2.49',
    period: '/mo',
    original: '$4.99',
    save: 'Save 50%',
    badge: 'Most Popular',
    highlighted: true,
    blurb: 'Billed yearly — 6 months free.',
    priceEnvKey: 'STRIPE_YEARLY_PRICE_ID',
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: '$79',
    period: 'once',
    save: 'Best value',
    blurb: 'Pay once, Premium forever.',
    priceEnvKey: 'STRIPE_LIFETIME_PRICE_ID',
  },
];

/** Server-only: whether a tier's Stripe price is configured (else "Coming soon"). */
export function tierEnabled(tier: PricingTier): boolean {
  return Boolean(process.env[tier.priceEnvKey]);
}
