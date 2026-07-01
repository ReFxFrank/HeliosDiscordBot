import type { Metadata } from 'next';
import { BRAND } from '@solari/shared';
import { LegalList, LegalSection, LegalShell } from '../../components/marketing/legal';

export const metadata: Metadata = {
  title: `Privacy Policy — ${BRAND.name}`,
  description: `How ${BRAND.name} collects, uses, and protects your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="1 July 2026"
      intro={
        <p>
          This Privacy Policy explains what data {BRAND.name} (&ldquo;the Service&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by [Operator Name], collects when you add
          the bot to a Discord server or use the {BRAND.name} dashboard, how we use it, and the
          choices you have. By using the Service you agree to this policy.
        </p>
      }
    >
      <LegalSection heading="1. Information we collect">
        <p>
          {BRAND.name} is designed to store only what is needed to provide the features you enable.
          Depending on which modules a server uses, we may store:
        </p>
        <LegalList
          items={[
            <>
              <strong>Discord identifiers</strong> — server (guild), channel, role, and user IDs;
              guild name, icon, and member count. These are how the bot targets its actions.
            </>,
            <>
              <strong>Configuration you set</strong> — the per-server settings you save in the
              dashboard (welcome/leave text, custom commands, reaction-role panels, embeds,
              scheduled messages, automod rules, and so on). Some of this is content you author.
            </>,
            <>
              <strong>Activity counters</strong> — for the Leveling module: message counts, XP,
              levels, and voice minutes per member. We do <em>not</em> store the content of ordinary
              messages; automod scans message content in memory to enforce rules and does not retain
              it.
            </>,
            <>
              <strong>Moderation records</strong> — warnings, mutes, kicks, bans and their reasons,
              with the acting moderator and target user IDs and timestamps.
            </>,
            <>
              <strong>Economy data</strong> — per-member virtual currency balances (wallet and
              bank) and cooldown timestamps.
            </>,
            <>
              <strong>Feature records</strong> — tickets and their transcripts, reminders,
              birthdays (the month/day you provide), starboard entries, giveaway and poll entries,
              suggestions, AFK statuses, and invite-tracking counts.
            </>,
            <>
              <strong>Social-alert subscriptions</strong> — the external accounts/feeds (e.g.
              Twitch, YouTube, Reddit, RSS URLs) a server configures to be watched.
            </>,
            <>
              <strong>Custom bot credentials (Bot Personalizer)</strong> — if a Premium server sets
              up a custom bot, its bot token is stored <strong>encrypted at rest</strong>
              (AES-256-GCM) and is never displayed back to you.
            </>,
            <>
              <strong>Dashboard sign-in</strong> — when you log in with Discord we receive, via
              Discord OAuth, your user ID, username, avatar, and the list of servers you can manage.
              Your session is held in an encrypted cookie.
            </>,
            <>
              <strong>Billing</strong> — Premium subscriptions are processed by Stripe. We store
              subscription and customer reference IDs and status; we do <strong>not</strong> receive
              or store your full card details.
            </>,
            <>
              <strong>Operational logs</strong> — limited technical logs (errors, timestamps) used
              to keep the Service running and secure.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. How we use your data">
        <p>We use the data above only to operate the Service, specifically to:</p>
        <LegalList
          items={[
            'Provide and configure the features each server enables;',
            'Enforce moderation and automod rules a server sets up;',
            'Track levels, economy balances, and other opt-in engagement features;',
            'Authenticate you on the dashboard and show the servers you can manage;',
            'Process Premium subscriptions and unlock premium features;',
            'Maintain the security, reliability, and integrity of the Service.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. How your data is shared">
        <p>
          We do not sell your data. We share data only with the service providers needed to run
          {` ${BRAND.name}`}:
        </p>
        <LegalList
          items={[
            <>
              <strong>Discord</strong> — the platform the bot operates on; all bot actions occur
              through Discord&rsquo;s API under Discord&rsquo;s own terms and privacy policy.
            </>,
            <>
              <strong>Stripe</strong> — payment processing for Premium subscriptions.
            </>,
            <>
              <strong>Infrastructure providers</strong> — the hosting, database, and cache services
              on which this instance runs.
            </>,
            <>
              <strong>Music playback</strong> — where the Music module is used, audio is streamed at
              playback time and is not recorded or stored.
            </>,
          ]}
        />
        <p>We may also disclose data where required by law or to protect our rights and users.</p>
      </LegalSection>

      <LegalSection heading="4. Data retention">
        <p>
          We keep data for as long as it is needed to provide the Service — generally while the bot
          remains in your server and your account is active. When the bot is removed from a server,
          or on a valid deletion request, the associated data is deleted or anonymized within a
          reasonable period, except where we must retain it to comply with legal obligations.
          Server administrators can also reset individual modules&rsquo; data (for example, resetting
          economy balances) from the dashboard or via bot commands.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your rights and choices">
        <LegalList
          items={[
            'Access — you can see most of your data through the dashboard and bot commands.',
            'Correction — update your server configuration at any time in the dashboard.',
            'Deletion — remove the bot from a server to stop processing, and contact us to request deletion of associated data.',
            'Withdrawal — disable any module to stop the corresponding processing.',
          ]}
        />
        <p>
          Depending on where you live, you may have additional rights under laws such as the GDPR or
          CCPA (including access, portability, and erasure). To exercise any right, contact us using
          the details below.
        </p>
      </LegalSection>

      <LegalSection heading="6. Children">
        <p>
          {BRAND.name} is not directed to children under the minimum age required to use Discord in
          their country (at least 13). We do not knowingly collect data from anyone below that age.
        </p>
      </LegalSection>

      <LegalSection heading="7. Security">
        <p>
          We apply reasonable technical and organizational measures to protect your data, including
          encryption of sensitive secrets at rest (such as custom bot tokens), encrypted dashboard
          sessions, and restricted access. No method of transmission or storage is perfectly secure,
          and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected by
          the &ldquo;Last updated&rdquo; date above. Continued use of the Service after a change
          means you accept the revised policy.
        </p>
      </LegalSection>

      <LegalSection heading="9. Contact">
        <p>
          Questions or requests about this policy or your data can be sent to the operator of this
          {` ${BRAND.name}`} instance at [contact email].
        </p>
      </LegalSection>
    </LegalShell>
  );
}
