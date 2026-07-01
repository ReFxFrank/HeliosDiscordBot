import type { Metadata } from 'next';
import { BRAND } from '@solari/shared';
import { LegalList, LegalSection, LegalShell } from '../../components/marketing/legal';

export const metadata: Metadata = {
  title: `Terms of Service — ${BRAND.name}`,
  description: `The terms that govern your use of ${BRAND.name}.`,
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="1 July 2026"
      intro={
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of {BRAND.name} (&ldquo;the
          Service&rdquo;), operated by [Operator Name], including the Discord bot and the
          {` ${BRAND.name}`} dashboard. By adding the bot to a server or using the dashboard, you
          agree to these Terms. If you do not agree, do not use the Service.
        </p>
      }
    >
      <LegalSection heading="1. Eligibility">
        <p>
          You must be at least 13 years old, or the minimum age required to use Discord in your
          country, and you must comply with the{' '}
          <a
            href="https://discord.com/terms"
            className="text-[var(--color-brand-bright)] hover:underline"
          >
            Discord Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="https://discord.com/guidelines"
            className="text-[var(--color-brand-bright)] hover:underline"
          >
            Community Guidelines
          </a>
          . You must have the necessary permissions to add the bot to any server you invite it to.
        </p>
      </LegalSection>

      <LegalSection heading="2. The Service">
        <p>
          {BRAND.name} provides moderation, engagement, utility, and entertainment features for
          Discord servers, configurable through the dashboard. Features may be added, changed, or
          removed over time. Some features are offered only under a paid Premium plan.
        </p>
      </LegalSection>

      <LegalSection heading="3. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <LegalList
          items={[
            'Violate any law, the Discord Terms of Service, or the rights of others;',
            'Harass, abuse, threaten, or harm other users;',
            'Distribute malware, spam, or illegal or infringing content;',
            'Attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to the Service or its infrastructure;',
            'Abuse, exploit, or automate features (including the economy or giveaways) in a way that is unfair or unintended.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Your content and configuration">
        <p>
          You are responsible for the content and settings you configure through the Service —
          including custom commands, messages, embeds, and automod rules — and for ensuring they
          comply with these Terms and applicable law. You grant us the limited right to store and
          process that content solely to provide the Service to you.
        </p>
      </LegalSection>

      <LegalSection heading="5. Premium and billing">
        <LegalList
          items={[
            'Premium features are offered on a subscription basis and billed through Stripe.',
            'Subscriptions renew automatically until cancelled; you can cancel at any time and will retain Premium access until the end of the current billing period.',
            'Except where required by law, payments are non-refundable.',
            'Prices and Premium feature sets may change; material changes will be communicated in advance where practicable.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Virtual items and economy">
        <p>
          Any in-server currency, items, levels, or similar virtual goods have no monetary value,
          cannot be exchanged for real money, and are not transferable outside the Service. They may
          be adjusted, reset, or removed by a server&rsquo;s administrators or by us, and they carry
          no guarantee of availability.
        </p>
      </LegalSection>

      <LegalSection heading="7. Custom bots (Bot Personalizer)">
        <p>
          If you use the Bot Personalizer to run a custom bot with your own Discord application and
          token, you remain solely responsible for that application, its token, and its compliance
          with the Discord Developer Terms and Policies. You must not upload a token you are not
          authorized to use. You can remove your custom bot at any time from the dashboard.
        </p>
      </LegalSection>

      <LegalSection heading="8. Availability and disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind, whether express or implied. We do not warrant that the Service will
          be uninterrupted, error-free, or secure, and we may modify, suspend, or discontinue any
          part of it at any time.
        </p>
      </LegalSection>

      <LegalSection heading="9. Limitation of liability">
        <p>
          To the maximum extent permitted by law, the operator of the Service will not be liable for
          any indirect, incidental, special, consequential, or punitive damages, or any loss of
          data, profits, or goodwill, arising from your use of or inability to use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="10. Termination">
        <p>
          You may stop using the Service at any time by removing the bot from your servers. We may
          suspend or terminate access to the Service, in whole or in part, for any user or server
          that violates these Terms or that we reasonably believe poses a risk to the Service or
          other users.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to these Terms">
        <p>
          We may revise these Terms from time to time. Material changes will be reflected by the
          &ldquo;Last updated&rdquo; date above. Continued use of the Service after a change means
          you accept the revised Terms.
        </p>
      </LegalSection>

      <LegalSection heading="12. Governing law and contact">
        <p>
          These Terms are governed by the laws of [Governing Jurisdiction], without regard to its
          conflict-of-laws rules. Questions about these Terms can be sent to the operator of this
          {` ${BRAND.name}`} instance at [contact email]. See also our{' '}
          <a href="/privacy" className="text-[var(--color-brand-bright)] hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
