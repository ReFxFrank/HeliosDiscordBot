'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setModuleEnabled } from '../../lib/config-actions';
import {
  disconnectTwitchAccount,
  getTwitchChatStatus,
  saveTwitchSection,
  type TwitchChatStatus,
} from '../../lib/twitch-chat-actions';
import { GlassCard } from '../ui/glass-card';
import { Field, monoInputClass } from '../ui/form';
import { Switch } from '../ui/switch';

type Account = { login: string; displayName: string } | null;

function Dot({ ok }: { ok: boolean | null }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${ok === null ? 'bg-white/30' : ok ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]'}`}
    />
  );
}

export function TwitchOverview({
  guildId,
  enabled,
  channel,
  bot,
  broadcaster,
  twitchReady,
  notice,
  counts,
}: {
  guildId: string;
  enabled: boolean;
  channel: string | null;
  bot: Account;
  broadcaster: Account;
  twitchReady: boolean;
  notice: { ok: boolean; text: string } | null;
  counts: Record<'commands' | 'keywords' | 'timers' | 'terms' | 'filters' | 'alerts', number>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<TwitchChatStatus | null>(null);
  const [channelText, setChannelText] = useState(channel ?? '');
  const [channelMessage, setChannelMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    const load = () =>
      getTwitchChatStatus(guildId)
        .then((next) => alive && setStatus(next))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [guildId]);

  const toggle = (next: boolean) =>
    startTransition(async () => {
      await setModuleEnabled(guildId, 'TWITCH_CHAT', next);
      router.refresh();
    });

  const saveChannel = () =>
    startTransition(async () => {
      const result = await saveTwitchSection(guildId, 'channel', channelText.trim() || null);
      setChannelMessage(result.ok ? 'Saved.' : (result.error ?? 'Could not save.'));
      router.refresh();
    });

  const disconnect = (role: 'bot' | 'broadcaster') =>
    startTransition(async () => {
      if (!window.confirm(`Disconnect the ${role === 'bot' ? 'bot' : 'broadcaster'} account?`))
        return;
      await disconnectTwitchAccount(guildId, role);
      router.refresh();
    });

  const connectUrl = (role: 'bot' | 'broadcaster') =>
    `/api/twitch/connect?guild=${guildId}&role=${role}`;

  if (!twitchReady) {
    return (
      <GlassCard className="p-4 text-sm text-white/70">
        This bot has no Twitch app set up (TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET on the server).
      </GlassCard>
    );
  }

  const links: [string, string, string][] = [
    ['/commands', 'Commands', `${counts.commands} custom`],
    ['/defaults', 'Default Commands', '!uptime, !so, !quote…'],
    ['/keywords', 'Keywords', `${counts.keywords} set up`],
    ['/timers', 'Timers', `${counts.timers} set up`],
    ['/filters', 'Spam Filters', `${counts.filters} on`],
    ['/blocked-terms', 'Blocked Terms', `${counts.terms} terms`],
    ['/alerts', 'Chat Alerts', `${counts.alerts} on`],
    ['/songs', 'Song Requests', '!sr with an OBS player'],
    ['/controls', 'Bot Controls', 'Nukes, say, shoutout'],
  ];

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm text-white/80 ${notice.ok ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10' : 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10'}`}
        >
          {notice.text}
        </p>
      )}

      <GlassCard className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white/90">Twitch Chat Bot</h3>
            <p className="text-xs text-white/50">
              {enabled
                ? 'On: the bot is in chat when everything below is green.'
                : 'Off: the bot stays out of chat.'}
            </p>
          </div>
          <Switch checked={enabled} onChange={toggle} label="Twitch Chat Bot" />
        </div>
        {enabled && status && (
          <ul className="flex flex-col gap-1.5 text-sm text-white/75">
            <li className="flex items-center gap-2">
              <Dot ok={status.connected} />
              {status.connected ? `Reading ${status.channel}’s chat` : 'Not in chat'}
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={status.isModerator} />
              {status.isModerator
                ? 'Moderator in the channel'
                : status.isModerator === false
                  ? 'Not a moderator yet'
                  : 'Moderator: checking…'}
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={status.live ? true : null} />
              {status.live ? 'Live now' : 'Offline'}
            </li>
            {status.problem && <li className="pl-4 text-xs text-white/55">{status.problem}</li>}
          </ul>
        )}
        {enabled && !status && (
          <p className="text-xs text-white/45">Waiting for the bot to report in…</p>
        )}
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="flex flex-col gap-3 p-5">
          <div>
            <h3 className="text-sm font-semibold text-white/90">Bot account</h3>
            <p className="text-xs text-white/50">
              {bot ? `Chatting as ${bot.displayName}.` : 'The Twitch account the bot chats as.'}
            </p>
          </div>
          {status?.botNeedsReconnect && (
            <p className="text-xs text-[var(--color-warning)]">
              New features need extra permissions: press Reconnect while signed in to Twitch as{' '}
              {bot?.login}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={connectUrl('bot')}
              className="rounded-lg bg-[#9146FF] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {bot ? 'Reconnect' : 'Connect bot account'}
            </a>
            {bot && (
              <button
                type="button"
                disabled={pending}
                onClick={() => disconnect('bot')}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>
          <p className="text-xs text-white/40">
            Twitch signs in whoever is logged in on twitch.tv in this browser, so log in there as
            the bot first (or use a private window).
          </p>
        </GlassCard>

        <GlassCard className="flex flex-col gap-3 p-5">
          <div>
            <h3 className="text-sm font-semibold text-white/90">Broadcaster</h3>
            <p className="text-xs text-white/50">
              {broadcaster
                ? `${broadcaster.displayName} is connected.`
                : 'Optional. The streamer connects once to unlock sub/bits/hype/poll alerts, channel point rewards and !settitle / !setgame.'}
            </p>
          </div>
          {status?.broadcaster === 'needs-reconnect' && (
            <p className="text-xs text-[var(--color-warning)]">
              Some permissions are missing: reconnect as {channel}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {channel ? (
              <a
                href={connectUrl('broadcaster')}
                className="rounded-lg border border-[#9146FF]/60 px-3 py-2 text-sm font-medium text-white hover:bg-[#9146FF]/20"
              >
                {broadcaster ? 'Reconnect' : `Connect ${channel}`}
              </a>
            ) : (
              <p className="text-xs text-white/45">Set the channel first.</p>
            )}
            {broadcaster && (
              <button
                type="button"
                disabled={pending}
                onClick={() => disconnect('broadcaster')}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>
          <p className="text-xs text-white/40">
            Must be signed in to Twitch as {channel ?? 'the streamer'}.
          </p>
        </GlassCard>
      </div>

      <GlassCard className="flex flex-col gap-3 p-5">
        <div className="max-w-md">
          <Field
            label="Twitch channel"
            hint="The streamer’s username. Make the bot a moderator there: /mod <bot name>."
          >
            <div className="flex gap-2">
              <input
                className={monoInputClass}
                value={channelText}
                placeholder="thesleepyfroggo"
                onChange={(e) => {
                  setChannelText(e.target.value);
                  setChannelMessage(null);
                }}
              />
              <button
                type="button"
                disabled={pending}
                onClick={saveChannel}
                className="rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </Field>
          {channelMessage && <p className="mt-1 text-xs text-white/55">{channelMessage}</p>}
        </div>
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(([path, title, subtitle]) => (
          <Link
            key={path}
            href={`/servers/${guildId}/twitch${path}`}
            className="glass rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.04]"
          >
            <p className="text-sm font-medium text-white/90">{title}</p>
            <p className="text-xs text-white/45">{subtitle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
