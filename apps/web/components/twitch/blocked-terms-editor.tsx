'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  TWITCH_BLOCKED_TERMS_MAX,
  TWITCH_DEFAULT_LOOKALIKES,
  twitchChatConfigProblems,
  type TwitchBlockedTerm,
  type TwitchChatConfig,
  type TwitchFilterAction,
} from '@refx/shared';
import { Field, inputClass, monoInputClass } from '../ui/form';
import { Switch } from '../ui/switch';
import { NumberInput, ToggleRow, newId, useSection } from './ui';

export function BlockedTermsEditor({
  guildId,
  config,
}: {
  guildId: string;
  config: TwitchChatConfig;
}) {
  const { value, update, bar } = useSection(
    guildId,
    'blockedTerms',
    config.blockedTerms,
    (next) => twitchChatConfigProblems({ ...config, blockedTerms: next })[0] ?? null,
    (next) => ({ ...next, terms: next.terms.filter((t) => t.phrase.trim()) }),
  );
  const patchTerm = (id: string, change: Partial<TwitchBlockedTerm>) =>
    update((prev) => ({
      ...prev,
      terms: prev.terms.map((t) => (t.id === id ? { ...t, ...change } : t)),
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <ToggleRow
            title="Match lookalikes"
            description={`Swap ${Object.entries(TWITCH_DEFAULT_LOOKALIKES)
              .slice(0, 6)
              .map(([from, to]) => `${from}→${to}`)
              .join(' ')}… and accents before matching, and ignore spaces, dots and dashes.`}
            checked={value.lookalikes}
            onChange={(lookalikes) => update((prev) => ({ ...prev, lookalikes }))}
          />
          {value.lookalikes && (
            <Field label="Extra lookalikes" hint="One per line, like ß=b or ¡=i.">
              <textarea
                className={`${monoInputClass} resize-y`}
                rows={3}
                value={value.extraLookalikes}
                onChange={(e) => update((prev) => ({ ...prev, extraLookalikes: e.target.value }))}
              />
            </Field>
          )}
        </div>
        <Field label="Message in chat after acting" hint="Blank says nothing. $(user) works.">
          <input
            className={inputClass}
            value={value.message}
            maxLength={200}
            onChange={(e) => update((prev) => ({ ...prev, message: e.target.value }))}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        {value.terms.length === 0 && <p className="text-sm text-white/45">No blocked terms yet.</p>}
        {value.terms.map((term) => (
          <div
            key={term.id}
            className="grid items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 md:grid-cols-[1fr_auto_130px_110px_1fr_auto_auto]"
          >
            <input
              className={monoInputClass}
              value={term.phrase}
              placeholder={term.regex ? '/bad(word)?s?/' : 'bad phrase or bad*'}
              onChange={(e) => patchTerm(term.id, { phrase: e.target.value })}
            />
            <label className="flex items-center gap-1.5 text-xs text-white/60">
              <input
                type="checkbox"
                checked={term.regex}
                onChange={(e) => patchTerm(term.id, { regex: e.target.checked })}
              />
              regex
            </label>
            <select
              className={inputClass}
              value={term.action}
              onChange={(e) => patchTerm(term.id, { action: e.target.value as TwitchFilterAction })}
            >
              <option value="delete">Delete</option>
              <option value="timeout">Time out</option>
              <option value="ban">Ban</option>
            </select>
            {term.action === 'timeout' ? (
              <NumberInput
                value={term.timeoutSeconds}
                min={1}
                max={1_209_600}
                onChange={(timeoutSeconds) => patchTerm(term.id, { timeoutSeconds })}
              />
            ) : (
              <span />
            )}
            <input
              className={inputClass}
              value={term.reason}
              placeholder="Reason (for logs)"
              maxLength={200}
              onChange={(e) => patchTerm(term.id, { reason: e.target.value })}
            />
            <Switch
              checked={term.enabled}
              onChange={(enabled) => patchTerm(term.id, { enabled })}
              label={`Term ${term.phrase}`}
            />
            <button
              type="button"
              aria-label="Remove term"
              onClick={() =>
                update((prev) => ({ ...prev, terms: prev.terms.filter((t) => t.id !== term.id) }))
              }
              className="rounded-md p-1.5 text-white/40 hover:text-[var(--color-danger)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {value.terms.length < TWITCH_BLOCKED_TERMS_MAX && (
          <button
            type="button"
            onClick={() =>
              update((prev) => ({
                ...prev,
                terms: [
                  ...prev.terms,
                  {
                    id: newId('term'),
                    phrase: '',
                    regex: false,
                    action: 'timeout',
                    timeoutSeconds: 600,
                    reason: '',
                    enabled: true,
                  },
                ],
              }))
            }
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/75 hover:text-white"
          >
            <Plus className="h-4 w-4" /> Add term
          </button>
        )}
      </div>
      {bar}
    </div>
  );
}
