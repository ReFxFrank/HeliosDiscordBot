'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runTwitchBotCommand } from '../../lib/twitch-chat-actions';
import { GlassCard } from '../ui/glass-card';
import { Field, inputClass, monoInputClass } from '../ui/form';
import { NumberInput } from './ui';

export interface NukeItem {
  id: string;
  detail: string;
  actor: string | null;
  action: string;
  createdAt: string;
  undone: boolean;
}

function useCommand(guildId: string) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (
    type: 'nuke' | 'rollback' | 'say' | 'shoutout',
    payload: Record<string, unknown>,
    after?: () => void,
  ) =>
    startTransition(async () => {
      const result = await runTwitchBotCommand(guildId, type, payload);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) after?.();
      router.refresh();
    });
  return { message, pending, run };
}

function Result({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p
      className={`text-sm ${message.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
    >
      {message.text}
    </p>
  );
}

export function BotControls({ guildId, nukes }: { guildId: string; nukes: NukeItem[] }) {
  const nuke = useCommand(guildId);
  const other = useCommand(guildId);
  const [phrase, setPhrase] = useState('');
  const [regex, setRegex] = useState(false);
  const [scrollback, setScrollback] = useState(60);
  const [action, setAction] = useState<'timeout' | 'delete' | 'ban'>('timeout');
  const [seconds, setSeconds] = useState(600);
  const [radiation, setRadiation] = useState(0);
  const [say, setSay] = useState('');
  const [shout, setShout] = useState('');

  const fire = () => {
    const text = phrase.trim();
    if (!text) return;
    if (
      action === 'ban' &&
      !window.confirm(`Ban everyone who said “${text}” in the last ${scrollback}s?`)
    )
      return;
    nuke.run('nuke', {
      phrase: regex ? `/${text.replace(/^\/|\/$/g, '')}/i` : text,
      scrollback,
      action,
      seconds,
      radiation,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-sm font-semibold text-white/90">Nuke</h3>
          <p className="text-xs text-white/50">
            Punish everyone who said something recently, and optionally keep doing it for a while
            (“radiation”). Mods, VIP-exempt and the broadcaster are never hit. Same as !nuke in
            chat.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <Field label="Phrase">
            <input
              className={monoInputClass}
              value={phrase}
              placeholder="buy followers"
              onChange={(e) => setPhrase(e.target.value)}
            />
          </Field>
          <label className="mt-7 flex items-center gap-1.5 text-xs text-white/60">
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />{' '}
            regex
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Look back (seconds)" hint="0–600. 0 = only new messages.">
            <NumberInput value={scrollback} min={0} max={600} onChange={setScrollback} />
          </Field>
          <Field label="Action">
            <select
              className={inputClass}
              value={action}
              onChange={(e) => setAction(e.target.value as typeof action)}
            >
              <option value="timeout">Time out</option>
              <option value="delete">Delete messages</option>
              <option value="ban">Ban</option>
            </select>
          </Field>
          {action === 'timeout' && (
            <Field label="Timeout (seconds)">
              <NumberInput value={seconds} min={1} max={1_209_600} onChange={setSeconds} />
            </Field>
          )}
          <Field label="Radiation (seconds)" hint="Keep catching new messages. 0 = off.">
            <NumberInput value={radiation} min={0} max={3600} onChange={setRadiation} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={nuke.pending || !phrase.trim()}
            onClick={fire}
            className="rounded-lg bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {nuke.pending ? 'Nuking…' : 'Nuke'}
          </button>
          <Result message={nuke.message} />
        </div>
      </GlassCard>

      <GlassCard className="flex flex-col gap-3 p-5">
        <h3 className="text-sm font-semibold text-white/90">Recent nukes</h3>
        {nukes.length === 0 && (
          <p className="text-sm text-white/45">No nukes in the last 30 days.</p>
        )}
        {nukes.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white/85">{item.detail}</p>
              <p className="text-xs text-white/45">
                {item.action} · {item.actor?.startsWith('dashboard:') ? 'dashboard' : item.actor} ·{' '}
                {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
            {item.undone ? (
              <span className="text-xs text-white/40">undone</span>
            ) : (
              <button
                type="button"
                disabled={nuke.pending}
                onClick={() => nuke.run('rollback', { logId: item.id })}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/75 hover:text-white"
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </GlassCard>

      <GlassCard className="grid gap-4 p-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Field label="Say in chat" hint="Posts as the bot.">
            <input
              className={inputClass}
              maxLength={500}
              value={say}
              onChange={(e) => setSay(e.target.value)}
            />
          </Field>
          <button
            type="button"
            disabled={other.pending || !say.trim()}
            onClick={() => other.run('say', { message: say }, () => setSay(''))}
            className="w-fit rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <Field label="Shoutout" hint="Chat message plus Twitch’s shoutout card (when live).">
            <input
              className={monoInputClass}
              placeholder="username"
              value={shout}
              onChange={(e) => setShout(e.target.value)}
            />
          </Field>
          <button
            type="button"
            disabled={other.pending || !shout.trim()}
            onClick={() => other.run('shoutout', { login: shout }, () => setShout(''))}
            className="w-fit rounded-lg bg-[#9146FF] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Shout out
          </button>
        </div>
        <div className="md:col-span-2">
          <Result message={other.message} />
        </div>
      </GlassCard>
    </div>
  );
}
