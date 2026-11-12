'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import {
  SOCIAL_MAX_PER_GUILD,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_TARGET_HINTS,
  socialSubscriptionInputSchema,
  type SocialPlatform,
} from '@refx/shared';
import { createSocialSubscription, deleteSocialSubscription } from '../lib/social-actions';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { GlassCard } from './ui/glass-card';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

export interface SocialAlertSummary {
  id: string;
  platform: SocialPlatform;
  target: string;
  channelId: string;
  mentionRoleId: string | null;
}

const emptyForm = {
  platform: 'twitch' as SocialPlatform,
  target: '',
  channelId: '',
  mentionRoleId: '',
};

export function SocialAlerts({
  guildId,
  alerts,
  roles,
  channels,
  twitchReady,
  moduleEnabled,
}: {
  guildId: string;
  alerts: SocialAlertSummary[];
  roles: RoleOption[];
  channels: ChannelOption[];
  twitchReady: boolean;
  moduleEnabled: boolean;
}) {
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const full = alerts.length >= SOCIAL_MAX_PER_GUILD;

  function create(): void {
    const candidate = {
      platform: form.platform,
      target: form.target,
      channelId: form.channelId,
      mentionRoleId: form.mentionRoleId || null,
    };
    const parsed = socialSubscriptionInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the alert details.');
      setStatus('error');
      return;
    }
    startTransition(async () => {
      const result = await createSocialSubscription(guildId, candidate);
      if (result.ok) {
        setForm((f) => ({ ...emptyForm, platform: f.platform, channelId: f.channelId }));
        setError(null);
        setStatus('saved');
      } else {
        setError(result.error ?? 'Could not add the alert.');
        setStatus('error');
      }
    });
  }

  function remove(id: string): void {
    startTransition(async () => {
      await deleteSocialSubscription(guildId, id);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {!moduleEnabled ? (
        <GlassCard className="border-[var(--color-warning)]/30 p-4 text-sm text-white/70">
          The Social Alerts module is off, so nothing posts yet. Turn it on from the Overview page.
        </GlassCard>
      ) : null}

      <GlassCard className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold text-white/90">New alert</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Platform">
            <select
              className={inputClass}
              value={form.platform}
              onChange={(e) =>
                setForm((f) => ({ ...f, platform: e.target.value as SocialPlatform, target: '' }))
              }
            >
              {SOCIAL_PLATFORMS.map((platform) => (
                <option key={platform} value={platform} className="bg-[var(--color-base-elevated)]">
                  {SOCIAL_PLATFORM_LABELS[platform]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source" hint={SOCIAL_TARGET_HINTS[form.platform]}>
            <input
              className={inputClass}
              value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
              maxLength={500}
            />
          </Field>
          <Field label="Post in" hint="The channel the alert goes to.">
            <ChannelSelect
              channels={channels}
              only="text"
              placeholder="Select a channel…"
              selected={form.channelId ? [form.channelId] : []}
              onChange={(ids) => setForm((f) => ({ ...f, channelId: ids[0] ?? '' }))}
            />
          </Field>
          <Field label="Ping role" hint="Optional. Mentioned with every alert.">
            <RoleSelect
              roles={roles}
              placeholder="Nobody"
              selected={form.mentionRoleId ? [form.mentionRoleId] : []}
              onChange={(ids) => setForm((f) => ({ ...f, mentionRoleId: ids[0] ?? '' }))}
            />
          </Field>
        </div>
        {form.platform === 'twitch' && !twitchReady ? (
          <p className="text-sm text-[var(--color-warning)]">
            Twitch alerts need a Twitch developer app: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET
            on the bot host, then restart the bot and dashboard.
          </p>
        ) : null}
        {error && status === 'error' ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : null}
        {full ? (
          <p className="text-sm text-white/50">
            This server has the maximum of {SOCIAL_MAX_PER_GUILD} alerts. Remove one to add another.
          </p>
        ) : (
          <SaveBar
            pending={pending}
            status={status}
            onSave={create}
            label="Add alert"
            savedMessage="Added — the bot is watching it now."
          />
        )}
      </GlassCard>

      {alerts.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-white/40">No alerts yet.</GlassCard>
      ) : (
        <GlassCard className="divide-y divide-white/5 p-0">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white/90">
                  {SOCIAL_PLATFORM_LABELS[alert.platform] ?? alert.platform}
                  <span className="ml-2 font-mono text-white/60">{alert.target}</span>
                </p>
                <p className="text-xs text-white/40">
                  #{channelName(alert.channelId)}
                  {alert.mentionRoleId ? ` · pings @${roleName(alert.mentionRoleId)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(alert.id)}
                disabled={pending}
                title="Remove"
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
