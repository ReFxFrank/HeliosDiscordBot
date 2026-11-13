'use client';

import {
  TWITCH_FILTERS,
  type TwitchChatConfig,
  type TwitchFilterAction,
  type TwitchFilterKey,
  type TwitchFilters,
} from '@refx/shared';
import { Field, inputClass } from '../ui/form';
import { Switch } from '../ui/switch';
import { TokenListInput } from '../ui/token-list-input';
import { NumberInput, ToggleRow, useSection } from './ui';

/** Each filter's own number settings: [field, label, min, max]. */
const NUMBERS: Partial<Record<TwitchFilterKey, [string, string, number, number][]>> = {
  caps: [
    ['minLength', 'Only check messages with at least this many letters', 5, 500],
    ['maxPercent', 'Act at this % capitals or more', 10, 100],
  ],
  symbols: [
    ['maxCount', 'Act at more than this many symbols', 1, 500],
    ['minLength', 'Or, for messages at least this long…', 5, 500],
    ['maxPercent', '…at this % symbols or more', 10, 100],
  ],
  length: [['maxLength', 'Longest allowed (characters)', 20, 500]],
  height: [['maxLines', 'Most lines of chat a message may fill', 2, 30]],
  wordRepeat: [['maxRepeats', 'Act when one word/emote appears this many times', 2, 100]],
  repeat: [['count', 'Act on the Nth copy within 60 seconds', 2, 10]],
  emotes: [['maxEmotes', 'Most emotes allowed', 1, 200]],
  mentions: [['maxMentions', 'Most @mentions allowed', 1, 50]],
  longWord: [['maxLength', 'Longest allowed word (characters)', 10, 500]],
  unicode: [
    ['minLength', 'Only check messages at least this long', 3, 500],
    ['maxPercent', 'Act at this % fancy characters or more', 10, 100],
  ],
};

export function FiltersEditor({ guildId, config }: { guildId: string; config: TwitchChatConfig }) {
  const { value: filters, update, bar } = useSection(guildId, 'filters', config.filters);
  const patch = (key: TwitchFilterKey, change: Record<string, unknown>) =>
    update((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }) as TwitchFilters);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
        <Field label="Never filter" hint="Mods and the broadcaster are never filtered.">
          <select
            className={inputClass}
            value={filters.exempt}
            onChange={(e) =>
              update((prev) => ({ ...prev, exempt: e.target.value as TwitchFilters['exempt'] }))
            }
          >
            <option value="subscriber">Subscribers, VIPs and mods</option>
            <option value="vip">VIPs and mods</option>
            <option value="moderator">Mods only</option>
          </select>
        </Field>
        <div className="flex flex-col gap-2">
          <ToggleRow
            title="Warn first"
            description="A first offence only gets a [warning]; repeat offences within the window get the filter’s action."
            checked={filters.escalation.enabled}
            onChange={(enabled) =>
              update((prev) => ({ ...prev, escalation: { ...prev.escalation, enabled } }))
            }
          />
          {filters.escalation.enabled && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Window (minutes)">
                <NumberInput
                  value={filters.escalation.windowMinutes}
                  min={1}
                  max={1440}
                  onChange={(windowMinutes) =>
                    update((prev) => ({
                      ...prev,
                      escalation: { ...prev.escalation, windowMinutes },
                    }))
                  }
                />
              </Field>
              <Field label="Warning timeout (s)" hint="0 = just delete.">
                <NumberInput
                  value={filters.escalation.warningTimeout}
                  min={0}
                  max={600}
                  onChange={(warningTimeout) =>
                    update((prev) => ({
                      ...prev,
                      escalation: { ...prev.escalation, warningTimeout },
                    }))
                  }
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      {TWITCH_FILTERS.map(({ key, title, desc }) => {
        const filter = filters[key] as TwitchFilters[TwitchFilterKey] & Record<string, unknown>;
        return (
          <div key={key} className="rounded-lg border border-white/10">
            <div className="flex items-center justify-between gap-4 px-3 py-2.5">
              <div>
                <p className="text-sm text-white/90">{title}</p>
                <p className="text-xs text-white/50">{desc}</p>
              </div>
              <Switch
                checked={filter.enabled}
                onChange={(enabled) => patch(key, { enabled })}
                label={`${title} filter`}
              />
            </div>
            {filter.enabled && (
              <div className="flex flex-col gap-4 border-t border-white/10 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={filters.escalation.enabled ? 'Action (after the warning)' : 'Action'}
                  >
                    <select
                      className={inputClass}
                      value={filter.action}
                      onChange={(e) => patch(key, { action: e.target.value as TwitchFilterAction })}
                    >
                      <option value="delete">Delete the message</option>
                      <option value="timeout">Time out</option>
                      <option value="ban">Ban</option>
                    </select>
                  </Field>
                  {filter.action === 'timeout' && (
                    <Field label="Timeout (seconds)">
                      <NumberInput
                        value={filter.timeoutSeconds}
                        min={1}
                        max={1_209_600}
                        onChange={(timeoutSeconds) => patch(key, { timeoutSeconds })}
                      />
                    </Field>
                  )}
                </div>
                {key === 'links' && (
                  <>
                    <Field
                      label="Allowed sites"
                      hint="Comma-separated, e.g. twitch.tv, youtube.com, clips.twitch.tv. Subdomains count."
                    >
                      <TokenListInput
                        value={filters.links.allowed}
                        onChange={(allowed) => patch('links', { allowed })}
                        placeholder="twitch.tv, youtube.com"
                        maxItems={100}
                      />
                    </Field>
                    <ToggleRow
                      title="Subscribers may post links"
                      checked={filters.links.allowSubscribers}
                      onChange={(allowSubscribers) => patch('links', { allowSubscribers })}
                    />
                  </>
                )}
                {NUMBERS[key] && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {NUMBERS[key]?.map(([field, label, min, max]) => (
                      <Field key={field} label={label}>
                        <NumberInput
                          value={filter[field] as number}
                          min={min}
                          max={max}
                          onChange={(n) => patch(key, { [field]: n })}
                        />
                      </Field>
                    ))}
                  </div>
                )}
                <Field
                  label="Message in chat"
                  hint="Blank says nothing. $(user) works. Warnings get “[warning]” added."
                >
                  <input
                    className={inputClass}
                    value={filter.message}
                    maxLength={200}
                    onChange={(e) => patch(key, { message: e.target.value })}
                  />
                </Field>
              </div>
            )}
          </div>
        );
      })}
      {bar}
    </div>
  );
}
