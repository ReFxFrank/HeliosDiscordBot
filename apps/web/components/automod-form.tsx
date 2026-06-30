'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { AUTOMOD_ACTIONS, type AutomodAction, type AutomodConfig } from '@helios/shared';
import { saveAutomodConfig } from '../lib/config-actions';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

const toList = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

type FilterKey = 'invites' | 'links' | 'mentions' | 'caps' | 'spam' | 'words';
interface RuleLike {
  enabled: boolean;
  action: AutomodAction;
  timeoutMinutes: number;
}

const FILTER_LABELS: Record<FilterKey, string> = {
  invites: 'Discord invites',
  links: 'Links',
  mentions: 'Mass mentions',
  caps: 'Excessive caps',
  spam: 'Spam (message flood)',
  words: 'Blocked words',
};

export function AutomodForm({ guildId, initial }: { guildId: string; initial: AutomodConfig }) {
  const [config, setConfig] = useState<AutomodConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function patch<K extends FilterKey>(key: K, value: Partial<AutomodConfig[K]>): void {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveAutomodConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  function ruleControls(key: FilterKey, extra?: ReactNode): ReactNode {
    const rule = config[key] as RuleLike;
    return (
      <div className="rounded-lg border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-white/85">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) =>
                patch(key, { enabled: e.target.checked } as Partial<AutomodConfig[FilterKey]>)
              }
            />
            {FILTER_LABELS[key]}
          </label>
          <div className="flex items-center gap-2">
            <select
              className={`${inputClass} w-auto`}
              value={rule.action}
              onChange={(e) =>
                patch(key, { action: e.target.value as AutomodAction } as Partial<
                  AutomodConfig[FilterKey]
                >)
              }
            >
              {AUTOMOD_ACTIONS.map((action) => (
                <option key={action} value={action} className="bg-[#1a1b26]">
                  {action}
                </option>
              ))}
            </select>
            {rule.action === 'timeout' && (
              <input
                type="number"
                min={1}
                max={10080}
                title="Timeout minutes"
                className={`${inputClass} w-20`}
                value={rule.timeoutMinutes}
                onChange={(e) =>
                  patch(key, {
                    timeoutMinutes: Math.max(1, Number(e.target.value) || 10),
                  } as Partial<AutomodConfig[FilterKey]>)
                }
              />
            )}
          </div>
        </div>
        {extra && <div className="mt-3">{extra}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Exempt role IDs" hint="Comma-separated. Never auto-moderated.">
          <input
            className={monoInputClass}
            value={config.exemptRoleIds.join(', ')}
            onChange={(e) => {
              setConfig((p) => ({ ...p, exemptRoleIds: toList(e.target.value) }));
              setStatus('idle');
            }}
          />
        </Field>
        <Field label="Exempt channel IDs" hint="Comma-separated.">
          <input
            className={monoInputClass}
            value={config.exemptChannelIds.join(', ')}
            onChange={(e) => {
              setConfig((p) => ({ ...p, exemptChannelIds: toList(e.target.value) }));
              setStatus('idle');
            }}
          />
        </Field>
      </div>
      <p className="text-xs text-white/40">
        Members with Manage Messages are always exempt. Each filter deletes the message; the action
        adds a punishment.
      </p>

      {ruleControls('invites')}
      {ruleControls(
        'links',
        <Field label="Allowed domains" hint="Comma/newline-separated; everything else is blocked.">
          <input
            className={monoInputClass}
            value={config.links.allowlist.join(', ')}
            onChange={(e) => patch('links', { allowlist: toList(e.target.value) })}
          />
        </Field>,
      )}
      {ruleControls(
        'mentions',
        <Field label="Max mentions">
          <input
            type="number"
            min={1}
            max={50}
            className={`${inputClass} w-24`}
            value={config.mentions.maxMentions}
            onChange={(e) =>
              patch('mentions', { maxMentions: Math.max(1, Number(e.target.value) || 5) })
            }
          />
        </Field>,
      )}
      {ruleControls(
        'caps',
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Caps %">
            <input
              type="number"
              min={50}
              max={100}
              className={inputClass}
              value={config.caps.percent}
              onChange={(e) =>
                patch('caps', {
                  percent: Math.min(100, Math.max(50, Number(e.target.value) || 70)),
                })
              }
            />
          </Field>
          <Field label="Min length">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={config.caps.minLength}
              onChange={(e) =>
                patch('caps', { minLength: Math.max(1, Number(e.target.value) || 10) })
              }
            />
          </Field>
        </div>,
      )}
      {ruleControls(
        'spam',
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Max messages">
            <input
              type="number"
              min={2}
              max={30}
              className={inputClass}
              value={config.spam.maxMessages}
              onChange={(e) =>
                patch('spam', { maxMessages: Math.max(2, Number(e.target.value) || 5) })
              }
            />
          </Field>
          <Field label="Per seconds">
            <input
              type="number"
              min={1}
              max={60}
              className={inputClass}
              value={config.spam.windowSeconds}
              onChange={(e) =>
                patch('spam', { windowSeconds: Math.max(1, Number(e.target.value) || 5) })
              }
            />
          </Field>
        </div>,
      )}
      {ruleControls(
        'words',
        <Field label="Blocked words" hint="Comma/newline-separated. Whole-word, case-insensitive.">
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={config.words.list.join(', ')}
            onChange={(e) => patch('words', { list: toList(e.target.value) })}
          />
        </Field>,
      )}

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
