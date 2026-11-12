'use client';

import { useState, useTransition } from 'react';
import {
  WELCOME_THUMBNAILS,
  welcomeConfigSchema,
  type WelcomeConfig,
  type WelcomeThumbnail,
} from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveWelcomeConfig } from '../lib/config-actions';
import { ChannelSelect } from './ui/entity-select';
import { Switch } from './ui/switch';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { MessageComposer, WELCOME_PLACEHOLDERS } from './ui/message-composer';
import { ImageUrlField } from './ui/image-url-field';
import {
  EmbedBuilder,
  draftToSpec,
  specToDraft,
  type EmbedDraft,
  type EmbedVariable,
} from './ui/embed-builder';

const EMBED_VARIABLES: EmbedVariable[] = WELCOME_PLACEHOLDERS.map((p) => ({
  token: p.token,
  desc: p.label,
}));

const THUMBNAIL_LABELS: Record<WelcomeThumbnail, string> = {
  server: 'Server icon',
  user: "Member's avatar",
  custom: 'Custom image (embed thumbnail URL)',
  none: 'No thumbnail',
};

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div>
        <p className="text-sm text-white/90">{title}</p>
        <p className="text-xs text-white/50">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

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
  // The embed is edited as a plain-string draft so half-typed URLs/colours never
  // trip validation mid-edit; it becomes an EmbedSpec at save time.
  const [embedDraft, setEmbedDraft] = useState<EmbedDraft>(() => specToDraft(initial.embed));
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof WelcomeConfig>(key: K, value: WelcomeConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
    setError(null);
  }

  function updateEmbed(draft: EmbedDraft): void {
    setEmbedDraft(draft);
    setStatus('idle');
    setError(null);
  }

  function fail(message: string): void {
    setError(message);
    setStatus('error');
  }

  function save(): void {
    const embed = draftToSpec(embedDraft);
    if (config.channelId && config.embedEnabled && !embed && !config.message.trim()) {
      fail(
        'The welcome embed is empty. Add some content, or turn the embed off and write a message.',
      );
      return;
    }
    if (config.channelId && !config.embedEnabled && !config.message.trim()) {
      fail('Write a welcome message, or turn on the embed.');
      return;
    }
    if (config.thumbnail === 'custom' && config.embedEnabled && !embed?.thumbnailUrl) {
      fail('Custom thumbnail is selected: set a thumbnail URL in the embed editor.');
      return;
    }

    // Validate against the same schema the server action uses, so the user
    // sees *what* is wrong instead of a bare "Could not save".
    const parsed = welcomeConfigSchema.safeParse({
      ...config,
      embed: embed ?? {},
      // Empty string → null (schema is url|null).
      cardBackground: config.cardBackground?.trim() ? config.cardBackground.trim() : null,
      bannerUrl: config.bannerUrl?.trim() ? config.bannerUrl.trim() : null,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(issue ? `${issue.path.join('.') || 'config'}: ${issue.message}` : 'Invalid settings.');
      return;
    }

    startTransition(async () => {
      const result = await saveWelcomeConfig(guildId, parsed.data);
      if (result.ok) setConfig(parsed.data);
      else setError(result.error ?? null);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Welcome Message"
        description="Greet new members in a channel when they join, as a message, an embed, or both."
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

          <div className="max-w-2xl">
            <Field
              label="Banner"
              hint="Optional. A picture shown at the top of every welcome. Wide images (about 3:1, e.g. 1200×400) look best. PNG, JPEG, GIF or WebP up to 8 MB."
            >
              <ImageUrlField
                guildId={guildId}
                value={config.bannerUrl ?? ''}
                onChange={(url) => update('bannerUrl', url || null)}
                placeholder="Paste an image link, or upload one"
                previewClassName="h-20 max-w-80"
              />
            </Field>
          </div>

          <ToggleRow
            title="Send as an embed"
            description="A rich card (title, description, colour, images) with optional text above it."
            checked={config.embedEnabled}
            onChange={(next) => update('embedEnabled', next)}
          />

          {config.embedEnabled ? (
            <>
              <EmbedBuilder
                guildId={guildId}
                bannerUrl={config.bannerUrl ?? undefined}
                value={embedDraft}
                onChange={updateEmbed}
                variables={EMBED_VARIABLES}
                content={config.message}
                onContentChange={(v) => update('message', v)}
                contentPlaceholder="Optional, e.g. {user} — mentions only ping from the message text."
              />
              <div className="max-w-md">
                <Field
                  label="Thumbnail"
                  hint="The small image in the embed's corner. Custom uses the thumbnail URL set above."
                >
                  <select
                    className={inputClass}
                    value={config.thumbnail}
                    onChange={(e) => update('thumbnail', e.target.value as WelcomeThumbnail)}
                  >
                    {WELCOME_THUMBNAILS.map((key) => (
                      <option key={key} value={key}>
                        {THUMBNAIL_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          ) : (
            <Field label="Message" hint="Click a chip to insert a variable.">
              <MessageComposer
                value={config.message}
                onChange={(v) => update('message', v)}
                placeholders={WELCOME_PLACEHOLDERS}
              />
            </Field>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Welcome Card"
        description="Attach a generated image with the member's avatar and name to the welcome message."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <ToggleRow
            title="Enable welcome card"
            description="Render a banner image with each welcome."
            checked={config.cardEnabled}
            onChange={(next) => update('cardEnabled', next)}
          />
          {config.cardEnabled && (
            <Field
              label="Background image"
              hint="Optional. Upload a picture or paste a link. A 1024×256 image works best; blank uses the default gradient."
            >
              <ImageUrlField
                guildId={guildId}
                value={config.cardBackground ?? ''}
                onChange={(url) => update('cardBackground', url || null)}
                previewClassName="h-16 max-w-80"
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
          <ToggleRow
            title="DM new members"
            description="Send a private welcome on join."
            checked={config.dmEnabled}
            onChange={(next) => update('dmEnabled', next)}
          />
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

      <SettingsSection
        title="Boost Thanks"
        description="Thank members publicly when they boost the server."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <div className="max-w-md">
            <Field label="Boost channel" hint="Blank disables boost thanks.">
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="None"
                selected={config.boostChannelId ? [config.boostChannelId] : []}
                onChange={(ids) => update('boostChannelId', ids[0] ?? null)}
              />
            </Field>
          </div>
          <Field label="Message">
            <MessageComposer
              value={config.boostMessage}
              onChange={(v) => update('boostMessage', v)}
              placeholders={WELCOME_PLACEHOLDERS}
            />
          </Field>
        </div>
      </SettingsSection>

      <div className="flex flex-col gap-2 pt-1">
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}
