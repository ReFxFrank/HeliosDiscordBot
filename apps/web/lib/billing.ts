'use server';

import { redirect } from 'next/navigation';
import type Stripe from 'stripe';
import { prisma } from '@solari/database';
import { assertCanManage, requireSession } from './auth-guards';
import { canManageBilling } from './billing-access';
import { getStripe } from './stripe';

function baseUrl(): string {
  return process.env.AUTH_URL ?? 'http://localhost:3000';
}

export type PremiumPlan = 'monthly' | 'yearly' | 'lifetime';

/**
 * Return a usable Stripe customer id for the guild. If one is stored but no
 * longer exists (created under test-mode keys before switching to live, or a
 * different/recreated Stripe account), mint a fresh one instead of failing —
 * the checkout is self-healing against that mismatch.
 */
async function ensureCustomer(
  stripe: Stripe,
  guildId: string,
  existingId: string | null | undefined,
): Promise<string> {
  if (existingId) {
    try {
      const customer = await stripe.customers.retrieve(existingId);
      if (!(customer as Stripe.DeletedCustomer).deleted) return existingId;
    } catch {
      // resource_missing (wrong mode/account) — fall through and create anew.
    }
  }
  const created = await stripe.customers.create({ metadata: { guildId } });
  return created.id;
}

/** Resolve a plan to its Stripe price + checkout mode. Lifetime is one-time. */
function planConfig(plan: PremiumPlan): { priceId: string | undefined; oneTime: boolean } {
  switch (plan) {
    case 'yearly':
      return { priceId: process.env.STRIPE_YEARLY_PRICE_ID, oneTime: false };
    case 'lifetime':
      return { priceId: process.env.STRIPE_LIFETIME_PRICE_ID, oneTime: true };
    default:
      return { priceId: process.env.STRIPE_PREMIUM_PRICE_ID, oneTime: false };
  }
}

/**
 * Start a per-server Premium checkout for the chosen plan. Verifies the caller
 * can manage the guild, reuses (or creates) that guild's Stripe customer, and
 * redirects to Stripe Checkout. Monthly/Yearly use subscription mode; Lifetime
 * uses one-time payment mode. The guildId/userId ride in metadata (on the
 * subscription and the session/payment) so the webhook can map it back.
 */
export async function startCheckout(
  guildId: string,
  plan: PremiumPlan = 'monthly',
): Promise<void> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const stripe = getStripe();
  const { priceId, oneTime } = planConfig(plan);
  if (!stripe || !priceId) {
    console.error(
      `[billing] checkout unavailable: guild=${guildId} plan=${plan} hasStripe=${Boolean(
        stripe,
      )} hasPriceId=${Boolean(priceId)} (is the plan's STRIPE_*_PRICE_ID set?)`,
    );
    redirect(`/servers/${guildId}/premium?billing_error=1`);
  }
  // Catch the common setup slip: a Product id ("prod_…") pasted where the Price
  // id ("price_…") belongs. Fail with a clear log instead of Stripe's cryptic
  // "No such price".
  if (!priceId.startsWith('price_')) {
    console.error(
      `[billing] STRIPE price for plan=${plan} is "${priceId}", which is not a Price id. ` +
        'Use the Price id (starts with "price_"), not a Product id ("prod_…").',
    );
    redirect(`/servers/${guildId}/premium?billing_error=1`);
  }

  // Everything that can raise a Stripe error lives in here so a misconfigured
  // price surfaces as a friendly banner (with the real reason in the server
  // logs) instead of the generic route error boundary. redirect() returns
  // `never`, so `url` is always assigned by the time we redirect to it.
  let url: string;
  try {
    const existing = await prisma.guildSubscription.findUnique({ where: { guildId } });
    const customerId = await ensureCustomer(stripe, guildId, existing?.stripeCustomerId);
    // Record who is purchasing — billing visibility is scoped to them.
    await prisma.guildSubscription.upsert({
      where: { guildId },
      update: { stripeCustomerId: customerId, purchasedBy: session.user.id },
      create: { guildId, stripeCustomerId: customerId, purchasedBy: session.user.id },
    });

    const metadata = { guildId, userId: session.user.id, plan };
    const checkout = await stripe.checkout.sessions.create({
      mode: oneTime ? 'payment' : 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      allow_promotion_codes: true,
      ...(oneTime
        ? { payment_intent_data: { metadata } }
        : { subscription_data: { metadata } }),
      success_url: `${baseUrl()}/servers/${guildId}/premium?upgraded=1`,
      cancel_url: `${baseUrl()}/servers/${guildId}/premium`,
    });
    if (!checkout.url) throw new Error('Stripe returned no checkout URL');
    url = checkout.url;
  } catch (err) {
    // e.g. a one-time price used in subscription mode, a wrong/test-mode price
    // id, or a live/test key mismatch. The message here is the real diagnosis.
    console.error(`[billing] Stripe checkout failed: guild=${guildId} plan=${plan}`, err);
    redirect(`/servers/${guildId}/premium?billing_error=1`);
  }
  redirect(url);
}

/** Open the Stripe billing portal — restricted to the purchaser (or bot owner). */
export async function openBillingPortal(guildId: string): Promise<void> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const stripe = getStripe();
  if (!stripe) throw new Error('Billing is not configured.');

  const sub = await prisma.guildSubscription.findUnique({ where: { guildId } });
  if (!sub?.stripeCustomerId) throw new Error('No billing account for this server yet.');
  if (!canManageBilling(session, sub.purchasedBy)) {
    throw new Error('Only the member who purchased Premium can manage billing.');
  }

  let url: string;
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${baseUrl()}/servers/${guildId}/premium`,
    });
    url = portal.url;
  } catch (err) {
    // Most often: the Customer Portal isn't activated yet in the Stripe
    // dashboard (Settings → Billing → Customer portal).
    console.error(`[billing] Could not open billing portal: guild=${guildId}`, err);
    redirect(`/servers/${guildId}/premium?billing_error=portal`);
  }
  redirect(url);
}
