'use client';

import { BRAND } from '@refx/shared';
import { useState, useTransition } from 'react';
import type { ModerationConfig } from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import {
  saveGuildSettings,
  saveModerationConfig,
  type GuildSettingsInput,
} from '../lib/config-actions';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

/** Curated locale options (label → BCP-47 tag). Current value is merged in if absent. */
const LOCALES: { value: string; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'nl-NL', label: 'Nederlands' },
  { value: 'pl-PL', label: 'Polski' },
  { value: 'ru-RU', label: 'Русский' },
  { value: 'tr-TR', label: 'Türkçe' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'zh-CN', label: '中文 (简体)' },
];

/** Curated common IANA timezones. Current value is merged in if absent. */
const TIMEZONES: string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

const selectClass = `${inputClass} appearance-none pr-8`;

export function SettingsForm({
  guildId,
  initialSettings,
  initialModeration,
  roles,
  channels,
}: {
  guildId: string;
  initialSettings: GuildSettingsInput;
  initialModeration: ModerationConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [settings, setSettings] = useState<GuildSettingsInput>(initialSettings);
  const [moderation, setModeration] = useState<ModerationConfig>(initialModeration);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function updateSetting(key: keyof GuildSettingsInput, value: string): void {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function updateModeration<K extends keyof ModerationConfig>(
    key: K,
    value: ModerationConfig[K],
  ): void {
    setModeration((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const [settingsResult, moderationResult] = await Promise.all([
        saveGuildSettings(guildId, settings),
        saveModerationConfig(guildId, moderation),
      ]);
      setStatus(settingsResult.ok && moderationResult.ok ? 'saved' : 'error');
    });
  }

  // Include the persisted value if it isn't in the curated lists (never lose it).
  const localeOptions = LOCALES.some((l) => l.value === settings.locale)
    ? LOCALES
    : [{ value: settings.locale, label: settings.locale }, ...LOCALES];
  const timezoneOptions = TIMEZONES.includes(settings.timezone)
    ? TIMEZONES
    : [settings.timezone, ...TIMEZONES];

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Bot Masters"
        description={`Roles that can administer ${BRAND.name} on this server. Roles with the Administrator permission are automatically bot masters.`}
      >
        <div className="flex max-w-xl flex-col gap-5">
          <Field label="Bot master roles" hint={`Full access to ${BRAND.name}'s configuration.`}>
            <RoleSelect
              roles={roles}
              multiple
              selected={moderation.adminRoleIds}
              onChange={(ids) => updateModeration('adminRoleIds', ids)}
            />
          </Field>
          <Field label="Moderator roles" hint={`Can use ${BRAND.name}'s moderation commands.`}>
            <RoleSelect
              roles={roles}
              multiple
              selected={moderation.modRoleIds}
              onChange={(ids) => updateModeration('modRoleIds', ids)}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Voice Presence"
        description={`Park ${BRAND.name} in a voice channel 24/7 — it joins self-deafened and rejoins automatically if disconnected.`}
      >
        <div className="max-w-md">
          <Field
            label="Stay in this voice channel"
            hint="None = the bot doesn't sit in voice. Needs View Channel + Connect."
          >
            <ChannelSelect
              channels={channels}
              only="voice"
              placeholder="None"
              selected={settings.stayVoiceChannelId ? [settings.stayVoiceChannelId] : []}
              onChange={(ids) => {
                setSettings((prev) => ({ ...prev, stayVoiceChannelId: ids[0] ?? null }));
                setStatus('idle');
              }}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Language"
        description={`The language ${BRAND.name} uses for its responses on this server.`}
      >
        <div className="max-w-xs">
          <Field label="Language">
            <div className="relative">
              <select
                className={selectClass}
                value={settings.locale}
                onChange={(e) => updateSetting('locale', e.target.value)}
              >
                {localeOptions.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Timezone"
        description="The timezone used for scheduled actions and timestamps."
      >
        <div className="max-w-xs">
          <Field label="Timezone">
            <div className="relative">
              <select
                className={selectClass}
                value={settings.timezone}
                onChange={(e) => updateSetting('timezone', e.target.value)}
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Commands"
        description={`The prefix for ${BRAND.name}'s legacy text commands.`}
      >
        <div className="max-w-xs">
          <Field
            label="Prefix"
            hint={`Used for legacy text commands (${BRAND.name} is primarily slash-based).`}
          >
            <input
              className={monoInputClass}
              value={settings.prefix}
              onChange={(e) => updateSetting('prefix', e.target.value)}
              placeholder="!"
            />
          </Field>
        </div>
      </SettingsSection>

      <div className="pt-1">
        <SaveBar
          pending={pending}
          status={status}
          onSave={save}
          savedMessage="Saved — live on the bot."
        />
      </div>
    </div>
  );
}

function SelectChevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
    >
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
