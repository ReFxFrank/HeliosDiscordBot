import type { Metadata } from 'next';
import { BRAND } from '@solari/shared';
import { LegalList, LegalSection, LegalShell } from '../../components/marketing/legal';

export const metadata: Metadata = {
  title: `Refund & Cancellation Policy — ${BRAND.name}`,
  description: `How Premium billing, cancellations, and refunds work for ${BRAND.name}.`,
};

export default function RefundPage() {
  return (
    <LegalShell
      title="Refund & Cancellation Policy"
      updated="2 July 2026"
      intro={
        <p>
          This policy explains how {BRAND.name} Premium billing, cancellations, and refunds work. It
          supplements our{' '}
          <a href="/terms" className="text-[var(--color-brand-bright)] hover:underline">
            Terms of Service
          </a>
          . Premium is a per-server upgrade purchased through Stripe.
        </p>
      }
    >
      <LegalSection heading="1. Cancelling a subscription">
        <p>
          You can cancel a Monthly or Yearly subscription at any time from the dashboard —
          open the server&rsquo;s <strong>Premium</strong> page and click{' '}
          <strong>Manage billing</strong> to reach the Stripe billing portal. Cancellation takes
          effect at the end of the current billing period: you keep Premium until then, and the
          plan simply does not renew. Premium modules lock again afterward, and your free features
          keep working exactly as before.
        </p>
      </LegalSection>

      <LegalSection heading="2. Subscription refunds">
        <LegalList
          items={[
            'Subscription payments (Monthly and Yearly) are generally non-refundable, including for partially used billing periods, except where a refund is required by law.',
            'Because you can cancel at any time and keep access until the end of the period you already paid for, cancelling is usually the right step rather than requesting a refund.',
            'If you were charged in error (for example, a duplicate charge or a failure to deliver Premium), contact us and we will make it right.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Lifetime purchases">
        <p>
          A Lifetime purchase is a one-time payment for ongoing Premium on a single server. As a
          goodwill guarantee, you may request a full refund of a Lifetime purchase within{' '}
          <strong>[14] days</strong> of the purchase date if the premium features are not working
          as described. After that window, Lifetime purchases are non-refundable except where
          required by law.
        </p>
      </LegalSection>

      <LegalSection heading="4. Consumer rights">
        <p>
          Nothing in this policy limits any statutory rights you may have as a consumer under the
          law of your country or region (for example, a right of withdrawal for digital purchases).
          Where such rights apply, they take precedence over this policy.
        </p>
      </LegalSection>

      <LegalSection heading="5. How to request a refund">
        <p>
          Email the operator of this {BRAND.name} instance at{' '}
          <strong>[contact email]</strong> with the Discord server ID, the email or account used at
          checkout, and a brief description of the issue. We aim to respond within a few business
          days. Approved refunds are returned to the original payment method; the time to appear on
          your statement is set by your bank or card issuer.
        </p>
      </LegalSection>

      <LegalSection heading="6. Chargebacks">
        <p>
          If something goes wrong, please contact us first — most issues are resolved quickly. Filing
          a chargeback or payment dispute will result in the affected server&rsquo;s Premium being
          removed immediately, and may lead to suspension of future purchases. We&rsquo;re happy to
          help before it comes to that.
        </p>
      </LegalSection>

      <LegalSection heading="7. Changes to this policy">
        <p>
          We may update this policy from time to time; the &ldquo;Last updated&rdquo; date above
          reflects the latest version. Questions can be sent to <strong>[contact email]</strong>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
