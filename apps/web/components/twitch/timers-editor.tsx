'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  TWITCH_TIMERS_MAX,
  TWITCH_TIMER_MESSAGES_MAX,
  twitchChatConfigProblems,
  type TwitchChatConfig,
  type TwitchTimer,
} from '@refx/shared';
import { Field, inputClass } from '../ui/form';
import { ItemCard, NumberInput, TemplateInput, newId, useSection } from './ui';

export function TimersEditor({ guildId, config }: { guildId: string; config: TwitchChatConfig }) {
  const {
    value: timers,
    update,
    bar,
  } = useSection(
    guildId,
    'timers',
    config.timers,
    (next) => twitchChatConfigProblems({ ...config, timers: next })[0] ?? null,
  );
  const [open, setOpen] = useState<string | null>(null);
  const patch = (id: string, change: Partial<TwitchTimer>) =>
    update((list) => list.map((t) => (t.id === id ? { ...t, ...change } : t)));

  return (
    <div className="flex flex-col gap-3">
      {timers.map((timer) => (
        <ItemCard
          key={timer.id}
          title={timer.name || 'Timer'}
          subtitle={[
            timer.liveInterval ? `live every ${timer.liveInterval}m` : '',
            timer.offlineInterval ? `offline every ${timer.offlineInterval}m` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          enabled={timer.enabled}
          open={open === timer.id}
          onToggle={() => setOpen(open === timer.id ? null : timer.id)}
          onEnabled={(enabled) => patch(timer.id, { enabled })}
          onRemove={() => update((list) => list.filter((t) => t.id !== timer.id))}
        >
          <Field label="Name" hint="Only shown here.">
            <input
              className={inputClass}
              value={timer.name}
              maxLength={40}
              onChange={(e) => patch(timer.id, { name: e.target.value })}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-white/80">Messages</p>
            <p className="text-xs text-white/45">
              With more than one, each run posts the next in turn.
            </p>
            {timer.messages.map((message, mi) => (
              <div key={mi} className="flex items-start gap-2">
                <div className="flex-1">
                  <TemplateInput
                    rows={2}
                    value={message}
                    onChange={(next) =>
                      patch(timer.id, {
                        messages: timer.messages.map((m, i) => (i === mi ? next : m)),
                      })
                    }
                  />
                </div>
                {timer.messages.length > 1 && (
                  <button
                    type="button"
                    aria-label="Remove message"
                    onClick={() =>
                      patch(timer.id, { messages: timer.messages.filter((_, i) => i !== mi) })
                    }
                    className="mt-2 text-white/40 hover:text-[var(--color-danger)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {timer.messages.length < TWITCH_TIMER_MESSAGES_MAX && (
              <button
                type="button"
                onClick={() => patch(timer.id, { messages: [...timer.messages, ''] })}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Add message
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="While live, every (min)" hint="0 = not while live.">
              <NumberInput
                value={timer.liveInterval}
                min={0}
                max={1440}
                onChange={(liveInterval) => patch(timer.id, { liveInterval })}
              />
            </Field>
            <Field label="While offline, every (min)" hint="0 = not while offline.">
              <NumberInput
                value={timer.offlineInterval}
                min={0}
                max={1440}
                onChange={(offlineInterval) => patch(timer.id, { offlineInterval })}
              />
            </Field>
            <Field label="Chat lines needed" hint="Skips the turn if chat is quieter.">
              <NumberInput
                value={timer.minLines}
                min={0}
                max={500}
                onChange={(minLines) => patch(timer.id, { minLines })}
              />
            </Field>
          </div>
        </ItemCard>
      ))}
      {timers.length < TWITCH_TIMERS_MAX && (
        <button
          type="button"
          onClick={() => {
            const timer: TwitchTimer = {
              id: newId('timer'),
              name: `Timer ${timers.length + 1}`,
              messages: [''],
              liveInterval: 15,
              offlineInterval: 0,
              minLines: 5,
              enabled: true,
            };
            update((list) => [...list, timer]);
            setOpen(timer.id);
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/75 hover:text-white"
        >
          <Plus className="h-4 w-4" /> Add timer
        </button>
      )}
      {bar}
    </div>
  );
}
