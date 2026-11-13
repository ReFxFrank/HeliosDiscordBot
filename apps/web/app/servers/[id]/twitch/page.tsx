import { TWITCH_BOT_ACCOUNT_ID, prisma } from '@refx/database';
import { loadTwitchPage } from '../../../../lib/twitch-page';
import { twitchConfigured } from '../../../../lib/twitch-oauth';
import { TwitchOverview } from '../../../../components/twitch/overview';
import { PageHeader } from '../../../../components/twitch/ui';

export const dynamic = 'force-dynamic';

const NOTICES: Record<string, { ok: boolean; text: string }> = {
  'bot-connected': { ok: true, text: 'Bot account connected. It joins chat within a few seconds.' },
  'broadcaster-connected': {
    ok: true,
    text: 'Broadcaster connected: sub/bits/hype alerts and !settitle / !setgame are unlocked.',
  },
  'broadcaster-wrong-account': {
    ok: false,
    text: 'That isn’t the channel the bot serves. Sign in to Twitch as the streamer and try again.',
  },
};

function notice(code: string | undefined) {
  if (!code) return null;
  if (NOTICES[code]) return NOTICES[code];
  const reason = code.replace(/^(bot|broadcaster)-/, '');
  const text: Record<string, string> = {
    cancelled: 'The Twitch sign-in was cancelled.',
    expired: 'That Twitch sign-in took too long or was opened twice. Try again.',
    forbidden: 'You need Manage Server on this server to connect Twitch.',
    failed: 'Twitch didn’t accept the sign-in. Try again.',
    'missing-scopes': 'Some permissions weren’t granted. Connect again and approve everything.',
    'not-configured': 'This bot has no Twitch app set up on the server.',
  };
  return { ok: false, text: text[reason] ?? 'Something went wrong connecting Twitch.' };
}

export default async function TwitchOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ twitch?: string }>;
}) {
  const { id } = await params;
  const { twitch } = await searchParams;
  const { config, enabled } = await loadTwitchPage(id);
  const [bot, broadcaster] = await Promise.all([
    prisma.twitchAccount.findUnique({
      where: { id: TWITCH_BOT_ACCOUNT_ID },
      select: { login: true, displayName: true },
    }),
    config.channel
      ? prisma.twitchAccount.findFirst({
          where: { id: { startsWith: 'broadcaster:' }, login: config.channel },
          select: { login: true, displayName: true },
        })
      : null,
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Twitch Chat Bot">
        A Fossabot-style bot in your Twitch chat: commands, keywords, timers, spam filters, alerts,
        quotes, counters and song requests. It chats as its own Twitch account.
      </PageHeader>
      <TwitchOverview
        guildId={id}
        enabled={enabled}
        channel={config.channel}
        bot={bot}
        broadcaster={broadcaster}
        twitchReady={twitchConfigured()}
        notice={notice(twitch)}
        counts={{
          commands: config.commands.length,
          keywords: config.keywords.length,
          timers: config.timers.length,
          terms: config.blockedTerms.terms.length,
          filters: Object.values(config.filters).filter(
            (f) => typeof f === 'object' && f !== null && 'enabled' in f && f.enabled === true,
          ).length,
          alerts: Object.values(config.alerts).filter((a) => a.enabled).length,
        }}
      />
    </div>
  );
}
