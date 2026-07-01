'use client';

import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import type { TicketsConfig } from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveTicketsConfig } from '../lib/config-actions';
import { deployTicketPanel } from '../lib/tickets-actions';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';

export function TicketsForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: TicketsConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<TicketsConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [deployMsg, setDeployMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof TicketsConfig>(key: K, value: TicketsConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveTicketsConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  function deploy(): void {
    setDeployMsg(null);
    startTransition(async () => {
      const result = await deployTicketPanel(guildId);
      setDeployMsg(result.ok ? 'Panel deployed.' : (result.error ?? 'Could not deploy.'));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Ticket Setup"
        description="Where tickets are created, who can see them, and where transcripts go."
      >
        <div className="flex max-w-2xl flex-col gap-5">
          <Field label="Ticket category" hint="New ticket channels are created under this category.">
            <ChannelSelect
              channels={channels}
              only="category"
              placeholder="None"
              selected={config.categoryId ? [config.categoryId] : []}
              onChange={(ids) => update('categoryId', ids[0] ?? null)}
            />
          </Field>
          <Field label="Support roles" hint="These roles see and manage every ticket.">
            <RoleSelect
              roles={roles}
              multiple
              selected={config.supportRoleIds}
              onChange={(ids) => update('supportRoleIds', ids)}
            />
          </Field>
          <Field
            label="Transcript channel"
            hint="Where closed-ticket transcripts are posted. None disables transcripts."
          >
            <ChannelSelect
              channels={channels}
              only="text"
              placeholder="None"
              selected={config.transcriptChannelId ? [config.transcriptChannelId] : []}
              onChange={(ids) => update('transcriptChannelId', ids[0] ?? null)}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Ticket Behavior"
        description="The opening message and limits for how members open tickets."
      >
        <div className="flex flex-col gap-5">
          <Field label="Opening message" hint="Posted at the top of every new ticket.">
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={config.openMessage}
              onChange={(e) => update('openMessage', e.target.value)}
              maxLength={1500}
            />
          </Field>
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <Field label="Max open per user">
              <input
                type="number"
                min={1}
                max={10}
                className={inputClass}
                value={config.maxOpenPerUser}
                onChange={(e) => update('maxOpenPerUser', Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
            <Field label="Auto-close after (hours)" hint="0 disables inactivity auto-close.">
              <input
                type="number"
                min={0}
                max={720}
                className={inputClass}
                value={config.autoCloseHours}
                onChange={(e) => update('autoCloseHours', Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Ticket Panel"
        description="The embed + button members click to open a ticket. Save, then deploy it to a channel."
      >
        <div className="flex flex-col gap-5">
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <Field label="Panel title">
              <input
                className={inputClass}
                value={config.panelTitle}
                onChange={(e) => update('panelTitle', e.target.value)}
                maxLength={256}
              />
            </Field>
            <Field label="Button label">
              <input
                className={inputClass}
                value={config.buttonLabel}
                onChange={(e) => update('buttonLabel', e.target.value)}
                maxLength={80}
              />
            </Field>
          </div>
          <Field label="Panel description">
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={config.panelDescription}
              onChange={(e) => update('panelDescription', e.target.value)}
              maxLength={2000}
            />
          </Field>
          <div className="max-w-md">
            <Field label="Panel channel" hint="Where the panel is deployed. Save first, then deploy.">
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="None"
                selected={config.panelChannelId ? [config.panelChannelId] : []}
                onChange={(ids) => update('panelChannelId', ids[0] ?? null)}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={deploy}
              disabled={pending || !config.panelChannelId}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> Deploy panel
            </button>
            {deployMsg && <span className="text-sm text-white/60">{deployMsg}</span>}
          </div>
        </div>
      </SettingsSection>

      <div className="pt-1">
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}
