'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import {
  deleteCustomBot,
  saveCustomBot,
  setCustomBotEnabled,
} from '../lib/personalizer-actions';
import { GlassCard } from './ui/glass-card';
import { Switch } from './ui/switch';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

/** Identity/presence fields (never the token). */
interface Identity {
  applicationId: string | null;
  botName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  status: string;
  activityType: string | null;
  activityText: string | null;
  streamUrl: string | null;
  enabled: boolean;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'idle', label: 'Idle' },
  { value: 'dnd', label: 'Do Not Disturb' },
  { value: 'invisible', label: 'Invisible' },
];

const ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'PLAYING', label: 'Playing' },
  { value: 'LISTENING', label: 'Listening to' },
  { value: 'WATCHING', label: 'Watching' },
  { value: 'COMPETING', label: 'Competing in' },
  { value: 'STREAMING', label: 'Streaming' },
];

const ACTIVITY_VERB: Record<string, string> = {
  PLAYING: 'Playing',
  LISTENING: 'Listening to',
  WATCHING: 'Watching',
  COMPETING: 'Competing in',
  STREAMING: 'Streaming',
};

const STATUS_DOT: Record<string, string> = {
  online: '#23a55a',
  idle: '#f0b232',
  dnd: '#f23f43',
  invisible: '#80848e',
};

export function PersonalizerForm({
  guildId,
  initial,
  hasToken,
}: {
  guildId: string;
  initial: Identity;
  hasToken: boolean;
}) {
  const [form, setForm] = useState<Identity>(initial);
  // The token lives in its own state and is only ever sent when non-empty.
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [enableError, setEnableError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // True once a token has ever been stored (server) or typed this session.
  const tokenAvailable = hasToken || token.trim().length > 0;

  function update<K extends keyof Identity>(key: K, value: Identity[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function toggleEnabled(next: boolean): void {
    // Can't run a bot we have no token for — block and explain inline.
    if (next && !tokenAvailable) {
      setEnableError('Add a bot token and save before enabling.');
      return;
    }
    setEnableError(null);
    const previous = form.enabled;
    update('enabled', next); // optimistic
    startTransition(async () => {
      const result = await setCustomBotEnabled(guildId, next);
      if (!result.ok) {
        update('enabled', previous); // roll back
        setEnableError(result.error ?? 'Could not update the custom bot.');
      }
    });
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveCustomBot(guildId, {
        applicationId: form.applicationId,
        botName: form.botName,
        avatarUrl: form.avatarUrl,
        bannerUrl: form.bannerUrl,
        status: form.status,
        activityType: form.activityType,
        activityText: form.activityText,
        streamUrl: form.streamUrl,
        enabled: form.enabled,
        token: token || null,
      });
      if (result.ok) {
        setToken(''); // never keep a secret in state after it's stored
        setStatus('saved');
      } else {
        setStatus('error');
      }
    });
  }

  function remove(): void {
    if (!window.confirm('Remove your custom bot? This deletes its token and stops it.')) return;
    startTransition(async () => {
      const result = await deleteCustomBot(guildId);
      if (result.ok) {
        setForm({
          applicationId: null,
          botName: null,
          avatarUrl: null,
          bannerUrl: null,
          status: 'online',
          activityType: null,
          activityText: null,
          streamUrl: null,
          enabled: false,
        });
        setToken('');
        setStatus('idle');
        setEnableError(null);
      } else {
        setStatus('error');
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      {/* Editor */}
      <GlassCard className="flex flex-col gap-5 p-5">
        <Field
          label="Bot token"
          hint="Create an application at discord.com/developers, add a bot, paste its token, and invite it to this server."
        >
          <input
            type="password"
            autoComplete="off"
            className={monoInputClass}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setStatus('idle');
              setEnableError(null);
            }}
            placeholder={
              hasToken
                ? '•••••••• (a token is saved — leave blank to keep it)'
                : 'Paste your bot token'
            }
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Application ID">
            <input
              className={monoInputClass}
              value={form.applicationId ?? ''}
              onChange={(e) => update('applicationId', e.target.value || null)}
              placeholder="123456789012345678"
            />
          </Field>
          <Field label="Bot name">
            <input
              className={inputClass}
              maxLength={32}
              value={form.botName ?? ''}
              onChange={(e) => update('botName', e.target.value || null)}
              placeholder="Your Bot"
            />
          </Field>
          <Field label="Avatar URL">
            <input
              className={monoInputClass}
              value={form.avatarUrl ?? ''}
              onChange={(e) => update('avatarUrl', e.target.value || null)}
              placeholder="https://…/avatar.png"
            />
          </Field>
          <Field label="Banner URL">
            <input
              className={monoInputClass}
              value={form.bannerUrl ?? ''}
              onChange={(e) => update('bannerUrl', e.target.value || null)}
              placeholder="https://…/banner.png"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Status">
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-[var(--color-base-elevated)]">
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Activity type">
            <select
              className={inputClass}
              value={form.activityType ?? ''}
              onChange={(e) => update('activityType', e.target.value || null)}
            >
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-[var(--color-base-elevated)]">
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Activity text" hint="Shown after the verb, e.g. “/help” or “over the server”.">
          <input
            className={inputClass}
            maxLength={128}
            value={form.activityText ?? ''}
            onChange={(e) => update('activityText', e.target.value || null)}
            placeholder="/help"
          />
        </Field>

        {form.activityType === 'STREAMING' && (
          <Field label="Stream URL" hint="A twitch.tv or youtube.com link.">
            <input
              className={monoInputClass}
              value={form.streamUrl ?? ''}
              onChange={(e) => update('streamUrl', e.target.value || null)}
              placeholder="https://twitch.tv/…"
            />
          </Field>
        )}

        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div>
            <p className="text-sm text-white/90">Enabled</p>
            <p className="text-xs text-white/50">Run your custom bot for this server.</p>
          </div>
          <Switch
            checked={form.enabled}
            disabled={pending}
            onChange={toggleEnabled}
            label="Enable custom bot"
          />
        </div>
        {enableError && <p className="-mt-2 text-sm text-[var(--color-danger)]">{enableError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SaveBar
            pending={pending}
            status={status}
            onSave={save}
            savedMessage="Saved — restarting your bot."
          />
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-[var(--color-danger)] disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Remove custom bot
          </button>
        </div>
      </GlassCard>

      {/* Live preview */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-white/80">Preview</span>
        <ProfilePreview form={form} />
        <p className="text-xs text-white/40">
          Discord rate-limits bot username changes to ~2/hour.
        </p>
      </div>
    </div>
  );
}

function ProfilePreview({ form }: { form: Identity }) {
  const name = form.botName?.trim() || 'Your Bot';
  const verb = form.activityType ? ACTIVITY_VERB[form.activityType] : null;
  const activity = verb ? `${verb} ${form.activityText?.trim() ?? ''}`.trim() : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#232428]">
      {form.bannerUrl ? (
        <img src={form.bannerUrl} alt="" className="h-16 w-full object-cover" />
      ) : (
        <div className="h-16 w-full bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9]" />
      )}
      <div className="px-4 pb-4">
        <div className="-mt-8 mb-2 flex items-end">
          <div className="relative">
            {form.avatarUrl ? (
              <img
                src={form.avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full border-[5px] border-[#232428] object-cover"
              />
            ) : (
              <div className="h-16 w-16 rounded-full border-[5px] border-[#232428] bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]" />
            )}
            <span
              className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-[3px] border-[#232428]"
              style={{ backgroundColor: STATUS_DOT[form.status] ?? STATUS_DOT.online }}
              title={form.status}
            />
          </div>
        </div>
        <div className="rounded-xl bg-[#111214] p-3">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-white">{name}</span>
            <span className="rounded bg-[#5865f2] px-1 py-px text-[10px] font-bold uppercase leading-none text-white">
              Bot
            </span>
          </div>
          {activity ? (
            <p className="mt-1 truncate text-sm text-[#b5bac1]">{activity}</p>
          ) : (
            <p className="mt-1 text-sm capitalize text-[#b5bac1]">{form.status}</p>
          )}
        </div>
      </div>
    </div>
  );
}
