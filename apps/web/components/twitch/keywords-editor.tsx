'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  TWITCH_KEYWORDS_MAX,
  twitchChatConfigProblems,
  type TwitchChatConfig,
  type TwitchKeyword,
} from '@refx/shared';
import { Field, inputClass } from '../ui/form';
import {
  ItemCard,
  NumberInput,
  PermissionSelect,
  ResponseTypeSelect,
  TemplateInput,
  ToggleRow,
  newId,
  useSection,
} from './ui';

function blankKeyword(index: number): TwitchKeyword {
  return {
    id: newId('kw'),
    name: `Keyword ${index}`,
    groups: [['']],
    target: 'message',
    response: '',
    responseType: 'reply',
    permission: 'everyone',
    cooldown: 30,
    userCooldown: 60,
    whenLive: true,
    whenOffline: true,
    enabled: true,
  };
}

export function KeywordsEditor({ guildId, config }: { guildId: string; config: TwitchChatConfig }) {
  const {
    value: keywords,
    update,
    bar,
  } = useSection(
    guildId,
    'keywords',
    config.keywords,
    (next) => twitchChatConfigProblems({ ...config, keywords: next })[0] ?? null,
    (next) =>
      next.map((k) => ({
        ...k,
        groups: k.groups
          .map((g) => g.map((p) => p.trim()).filter(Boolean))
          .filter((g) => g.length > 0),
      })),
  );
  const [open, setOpen] = useState<string | null>(null);
  const patch = (id: string, change: Partial<TwitchKeyword>) =>
    update((list) => list.map((k) => (k.id === id ? { ...k, ...change } : k)));

  return (
    <div className="flex flex-col gap-3">
      {keywords.map((keyword) => (
        <ItemCard
          key={keyword.id}
          title={keyword.name || 'Keyword'}
          subtitle={keyword.groups
            .map((g) => g.filter(Boolean).join(' + '))
            .filter(Boolean)
            .join(' | ')}
          enabled={keyword.enabled}
          open={open === keyword.id}
          onToggle={() => setOpen(open === keyword.id ? null : keyword.id)}
          onEnabled={(enabled) => patch(keyword.id, { enabled })}
          onRemove={() => update((list) => list.filter((k) => k.id !== keyword.id))}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" hint="Only shown here.">
              <input
                className={inputClass}
                value={keyword.name}
                maxLength={40}
                onChange={(e) => patch(keyword.id, { name: e.target.value })}
              />
            </Field>
            <Field label="Look in">
              <select
                className={inputClass}
                value={keyword.target}
                onChange={(e) =>
                  patch(keyword.id, { target: e.target.value as TwitchKeyword['target'] })
                }
              >
                <option value="message">The message</option>
                <option value="username">The chatter’s username</option>
                <option value="both">Both</option>
              </select>
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-white/80">Phrase groups</p>
            <p className="text-xs text-white/45">
              A group matches when <b>all</b> its phrases are in the message; any matching group
              fires the keyword. Matching ignores case and spaces. Start a phrase with{' '}
              <code>regex:</code>, <code>sensitive:</code> or <code>negative:</code> (chainable).
            </p>
            {keyword.groups.map((group, gi) => (
              <div
                key={gi}
                className="flex flex-col gap-1.5 rounded-lg border border-white/10 p-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">
                    Group {gi + 1} — one phrase per line
                  </span>
                  {keyword.groups.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove group"
                      onClick={() =>
                        patch(keyword.id, { groups: keyword.groups.filter((_, i) => i !== gi) })
                      }
                      className="text-white/40 hover:text-[var(--color-danger)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <textarea
                  className={`${inputClass} font-mono`}
                  rows={Math.max(2, group.length)}
                  value={group.join('\n')}
                  placeholder={'discord\nlink'}
                  onChange={(e) =>
                    patch(keyword.id, {
                      groups: keyword.groups.map((g, i) =>
                        i === gi ? e.target.value.split('\n').slice(0, 10) : g,
                      ),
                    })
                  }
                />
              </div>
            ))}
            {keyword.groups.length < 10 && (
              <button
                type="button"
                onClick={() => patch(keyword.id, { groups: [...keyword.groups, ['']] })}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Add phrase group
              </button>
            )}
          </div>
          <Field label="Response">
            <TemplateInput
              value={keyword.response}
              onChange={(response) => patch(keyword.id, { response })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Who triggers it">
              <PermissionSelect
                value={keyword.permission}
                onChange={(permission) => patch(keyword.id, { permission })}
              />
            </Field>
            <Field label="Response type">
              <ResponseTypeSelect
                value={keyword.responseType}
                onChange={(responseType) => patch(keyword.id, { responseType })}
              />
            </Field>
            <Field label="Cooldown (s)">
              <NumberInput
                value={keyword.cooldown}
                min={0}
                max={86_400}
                onChange={(cooldown) => patch(keyword.id, { cooldown })}
              />
            </Field>
            <Field label="User cooldown (s)">
              <NumberInput
                value={keyword.userCooldown}
                min={0}
                max={86_400}
                onChange={(userCooldown) => patch(keyword.id, { userCooldown })}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleRow
              title="Works while live"
              checked={keyword.whenLive}
              onChange={(whenLive) => patch(keyword.id, { whenLive })}
            />
            <ToggleRow
              title="Works while offline"
              checked={keyword.whenOffline}
              onChange={(whenOffline) => patch(keyword.id, { whenOffline })}
            />
          </div>
        </ItemCard>
      ))}
      {keywords.length < TWITCH_KEYWORDS_MAX && (
        <button
          type="button"
          onClick={() => {
            const keyword = blankKeyword(keywords.length + 1);
            update((list) => [...list, keyword]);
            setOpen(keyword.id);
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/75 hover:text-white"
        >
          <Plus className="h-4 w-4" /> Add keyword
        </button>
      )}
      {bar}
    </div>
  );
}
