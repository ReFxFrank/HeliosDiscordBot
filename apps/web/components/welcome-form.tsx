'use client';

import { useState, useTransition } from 'react';
import type { WelcomeConfig } from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveWelcomeConfig } from '../lib/config-actions';
import { ChannelSelect } from './ui/entity-select';
import { Switch } from './ui/switch';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { MessageComposer, WELCOME_PLACEHOLDERS } from './ui/message-composer';

export function WelcomeForm({
  guildId,
  initial,
  roles: _roles,
  channels,
}: {
  guildId: string;
  initial: WelcomeConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<WelcomeConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof WelcomeConfig>(key: K, value: WelcomeConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      // Normalize the card background: empty string → null (schema is url|null).
      const payload: WelcomeConfig = {
        ...config,
        cardBackground: config.cardBackground?.trim() ? config.cardBackground.trim() : null,
      };
      const result = await saveWelcomeConfig(guildId, payload);
      if (result.ok) setConfig(payload);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Welcome Message"
        description="Greet new members in a channel when they join."
      >
        <div className="flex flex-col gap-5">
          <div className="max-w-md">
            <Field label="Welcome channel" hint="Blank disables the join message.">
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="None"
                selected={config.channelId ? [config.channelId] : []}
                onChange={(ids) => update('channelId', ids[0] ?? null)}
              />
            </Field>
          </div>
          <Field label="Message" hint="Click a chip to insert a variable.">
            <MessageComposer
              value={config.message}
              onChange={(v) => update('message', v)}
              placeholders={WELCOME_PLACEHOLDERS}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Welcome Card"
        description="Attach a generated image with the member's avatar and name to the welcome message."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div>
              <p className="text-sm text-white/90">Enable welcome card</p>
              <p className="text-xs text-white/50">Render a banner image with each welcome.</p>
            </div>
            <Switch
              checked={config.cardEnabled}
              onChange={(next) => update('cardEnabled', next)}
              label="Enable welcome card"
            />
          </div>
          {config.cardEnabled && (
            <Field
              label="Background image URL"
              hint="Optional. A 1024×256 image works best; blank uses the default violet gradient."
            >
              <input
                className={inputClass}
                placeholder="https://example.com/banner.png"
                value={config.cardBackground ?? ''}
                onChange={(e) => update('cardBackground', e.target.value || null)}
              />
            </Field>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Direct Message"
        description="Optionally send a private greeting to the member on join."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div>
              <p className="text-sm text-white/90">DM new members</p>
              <p className="text-xs text-white/50">Send a private welcome on join.</p>
            </div>
            <Switch
              checked={config.dmEnabled}
              onChange={(next) => update('dmEnabled', next)}
              label="DM new members"
            />
          </div>
          {config.dmEnabled && (
            <Field label="DM message">
              <MessageComposer
                value={config.dmMessage}
                onChange={(v) => update('dmMessage', v)}
                placeholders={WELCOME_PLACEHOLDERS}
              />
            </Field>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Goodbye Message"
        description="Announce when a member leaves the server."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <div className="max-w-md">
            <Field label="Leave channel" hint="Blank disables the leave message.">
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="None"
                selected={config.leaveChannelId ? [config.leaveChannelId] : []}
                onChange={(ids) => update('leaveChannelId', ids[0] ?? null)}
              />
            </Field>
          </div>
          <Field label="Message">
            <MessageComposer
              value={config.leaveMessage}
              onChange={(v) => update('leaveMessage', v)}
              placeholders={WELCOME_PLACEHOLDERS}
            />
          </Field>
        </div>
      </SettingsSection>

      <div className="pt-1">
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}
