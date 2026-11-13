'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { TwitchChatConfig } from '@refx/shared';
import {
  deleteCounter,
  deleteQuoteAction,
  saveCounter,
  saveQuote,
} from '../../lib/twitch-chat-actions';
import { Field, inputClass, monoInputClass } from '../ui/form';
import { PermissionSelect, useSection } from './ui';

export interface QuoteItem {
  number: number;
  text: string;
  game: string | null;
  addedBy: string;
  createdAt: string;
}

export function QuotesEditor({
  guildId,
  config,
  quotes,
}: {
  guildId: string;
  config: TwitchChatConfig;
  quotes: QuoteItem[];
}) {
  const { value: settings, update, bar } = useSection(guildId, 'quotes', config.quotes);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [text, setText] = useState('');
  const [game, setGame] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (quote?: QuoteItem) => {
    setEditing(quote ? quote.number : 'new');
    setText(quote?.text ?? '');
    setGame(quote?.game ?? '');
    setError(null);
  };
  const submit = () =>
    startTransition(async () => {
      const result = await saveQuote(guildId, {
        number: editing === 'new' || editing === null ? undefined : editing,
        text,
        game,
      });
      if (result.ok) setEditing(null);
      else setError(result.error ?? 'Could not save.');
    });

  const shown = quotes.filter((q) => {
    const s = search.trim().toLowerCase();
    return !s || q.text.toLowerCase().includes(s) || String(q.number) === s.replace('#', '');
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="w-60">
          <Field label="Who can add quotes" hint="Editing and deleting is mods only.">
            <PermissionSelect
              value={settings.addPermission}
              onChange={(addPermission) => update((prev) => ({ ...prev, addPermission }))}
            />
          </Field>
        </div>
        <div className="flex-1">{bar}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search quotes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-white/40">{quotes.length} quotes</span>
        <button
          type="button"
          onClick={() => open()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> Add quote
        </button>
      </div>

      {editing !== null && (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-brand)]/40 p-4">
          <Field label={editing === 'new' ? 'New quote' : `Quote #${editing}`}>
            <textarea
              className={`${inputClass} resize-y`}
              rows={2}
              maxLength={400}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <Field label="Category" hint="Optional.">
            <input className={inputClass} value={game} onChange={(e) => setGame(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {shown.length === 0 && (
          <p className="text-sm text-white/45">
            No quotes yet. Add one here, or with !quote add in chat.
          </p>
        )}
        {shown.map((quote) => (
          <div
            key={quote.number}
            className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
          >
            <span className="w-10 shrink-0 font-mono text-sm text-white/40">#{quote.number}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/85">{quote.text}</p>
              <p className="text-xs text-white/40">
                {[quote.game, quote.addedBy, new Date(quote.createdAt).toLocaleDateString()]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <button
              type="button"
              aria-label="Edit quote"
              onClick={() => open(quote)}
              className="p-1 text-white/40 hover:text-white"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Delete quote"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Delete quote #${quote.number}?`)) {
                  startTransition(async () => {
                    await deleteQuoteAction(guildId, quote.number);
                  });
                }
              }}
              className="p-1 text-white/40 hover:text-[var(--color-danger)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CountersEditor({
  guildId,
  counters,
}: {
  guildId: string;
  counters: { name: string; label: string; value: number }[];
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(counters.map((c) => [c.name, String(c.value)])),
  );
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const commit = (name: string, raw: string) =>
    startTransition(async () => {
      const result = await saveCounter(guildId, name, Number(raw));
      setError(result.ok ? null : (result.error ?? 'Could not save.'));
      if (result.ok && name === newName.trim().toLowerCase()) setNewName('');
    });

  const named = counters.filter((c) => !c.name.startsWith('cmd:'));
  const commandCounts = counters.filter((c) => c.name.startsWith('cmd:'));

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-60">
          <Field label="New counter" hint="Letters, numbers, _ and -.">
            <input
              className={monoInputClass}
              value={newName}
              placeholder="deaths"
              onChange={(e) => setNewName(e.target.value)}
            />
          </Field>
        </div>
        <button
          type="button"
          disabled={pending || !newName.trim()}
          onClick={() => commit(newName.trim().toLowerCase(), '0')}
          className="mb-[22px] rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {named.length === 0 && (
          <p className="text-sm text-white/45">
            No counters yet. Use $(count deaths) in a command, or !count deaths +1.
          </p>
        )}
        {[...named, ...commandCounts].map((counter) => (
          <div
            key={counter.name}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
          >
            <span className="flex-1 font-mono text-sm text-white/85">
              {counter.label.startsWith('cmd:')
                ? `uses of ${counter.label.slice(4)}`
                : counter.label}
            </span>
            <input
              type="number"
              className={`${inputClass} w-32`}
              value={values[counter.name] ?? String(counter.value)}
              onChange={(e) => setValues((v) => ({ ...v, [counter.name]: e.target.value }))}
              onBlur={(e) => {
                if (e.target.value !== String(counter.value)) commit(counter.name, e.target.value);
              }}
            />
            <button
              type="button"
              aria-label={`Delete ${counter.name}`}
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Delete counter ${counter.name}?`)) {
                  startTransition(async () => {
                    await deleteCounter(guildId, counter.name);
                  });
                }
              }}
              className="p-1 text-white/40 hover:text-[var(--color-danger)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
