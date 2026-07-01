'use client';

import { useState, useTransition } from 'react';
import { Power, Trash2 } from 'lucide-react';
import {
  REPEAT_LABELS,
  SCHEDULE_REPEATS,
  scheduledMessageInputSchema,
  type ScheduleRepeat,
} from '@solari/shared';
import {
  createScheduledMessage,
  deleteScheduledMessage,
  toggleScheduledMessage,
} from '../lib/scheduled-actions';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { ChannelSelect } from './ui/entity-select';
import { GlassCard } from './ui/glass-card';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

export interface ScheduledSummary {
  id: string;
  name: string | null;
  channelId: string;
  content: string;
  repeat: ScheduleRepeat;
  nextRunAt: string;
  enabled: boolean;
}

const emptyForm = {
  name: '',
  channelId: '',
  content: '',
  repeat: 'NONE' as ScheduleRepeat,
  firstRunLocal: '',
};

export function ScheduledMessages({
  guildId,
  messages,
  roles: _roles,
  channels,
}: {
  guildId: string;
  messages: ScheduledSummary[];
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function create(): void {
    if (!form.firstRunLocal) {
      setStatus('error');
      return;
    }
    const candidate = {
      name: form.name.trim() || undefined,
      channelId: form.channelId.trim(),
      content: form.content,
      repeat: form.repeat,
      firstRunAt: new Date(form.firstRunLocal).toISOString(),
    };
    if (!scheduledMessageInputSchema.safeParse(candidate).success) {
      setStatus('error');
      return;
    }
    startTransition(async () => {
      const result = await createScheduledMessage(guildId, candidate);
      if (result.ok) {
        setForm(emptyForm);
        setStatus('saved');
      } else {
        setStatus('error');
      }
    });
  }

  function toggle(id: string, enabled: boolean): void {
    startTransition(async () => {
      await toggleScheduledMessage(guildId, id, enabled);
    });
  }

  function remove(id: string): void {
    startTransition(async () => {
      await deleteScheduledMessage(guildId, id);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold text-white/90">New scheduled message</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="Optional label for your reference.">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Daily reminder"
            />
          </Field>
          <Field label="Channel" hint="Where to post.">
            <ChannelSelect
              channels={channels}
              only="text"
              placeholder="None"
              selected={form.channelId ? [form.channelId] : []}
              onChange={(ids) => setForm((f) => ({ ...f, channelId: ids[0] ?? '' }))}
            />
          </Field>
        </div>
        <Field label="Message" hint="Up to 2000 characters.">
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            maxLength={2000}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First run" hint="Your local time.">
            <input
              type="datetime-local"
              className={inputClass}
              value={form.firstRunLocal}
              onChange={(e) => setForm((f) => ({ ...f, firstRunLocal: e.target.value }))}
            />
          </Field>
          <Field label="Repeat">
            <select
              className={inputClass}
              value={form.repeat}
              onChange={(e) => setForm((f) => ({ ...f, repeat: e.target.value as ScheduleRepeat }))}
            >
              {SCHEDULE_REPEATS.map((repeat) => (
                <option key={repeat} value={repeat} className="bg-[var(--color-base-elevated)]">
                  {REPEAT_LABELS[repeat]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <SaveBar
          pending={pending}
          status={status}
          onSave={create}
          label="Schedule message"
          savedMessage="Scheduled — live on the bot."
        />
      </GlassCard>

      {messages.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-white/40">
          No scheduled messages yet.
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-white/5 p-0">
          {messages.map((message) => (
            <div key={message.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white/90">
                  {message.name ?? message.content.slice(0, 60)}
                </p>
                <p className="font-mono text-xs text-white/40">
                  #{message.channelId} · {REPEAT_LABELS[message.repeat]} ·{' '}
                  {message.enabled
                    ? `next ${new Date(message.nextRunAt).toLocaleString()}`
                    : 'paused'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(message.id, !message.enabled)}
                disabled={pending}
                title={message.enabled ? 'Pause' : 'Resume'}
                className={`rounded-md border border-white/10 p-1.5 hover:text-white disabled:opacity-40 ${
                  message.enabled ? 'text-[var(--color-success)]' : 'text-white/40'
                }`}
              >
                <Power className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(message.id)}
                disabled={pending}
                title="Delete"
                className="rounded-md border border-white/10 p-1.5 text-white/60 hover:text-[var(--color-danger)] disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
