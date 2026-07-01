'use client';

import { useState, useTransition } from 'react';
import type { InviteTrackingConfig } from '@solari/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveInviteTrackingConfig } from '../lib/config-actions';
import { ChannelSelect } from './ui/entity-select';
import { Field, SaveBar, type SaveStatus } from './ui/form';

export function InviteTrackingForm({
  guildId,
  initial,
  roles: _roles,
  channels,
}: {
  guildId: string;
  initial: InviteTrackingConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<InviteTrackingConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function save(): void {
    startTransition(async () => {
      const result = await saveInviteTrackingConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Join-log channel"
        hint="Posts “X joined, invited by Y”. Blank disables the log (counts still track)."
      >
        <ChannelSelect
          channels={channels}
          only="text"
          placeholder="None"
          selected={config.logChannelId ? [config.logChannelId] : []}
          onChange={(ids) => {
            setConfig({ logChannelId: ids[0] ?? null });
            setStatus('idle');
          }}
        />
      </Field>
      <p className="text-xs text-white/40">
        The bot needs the <span className="font-mono">Manage Server</span> permission to read
        invites. Members check their own with <code className="font-mono">/invites count</code>.
      </p>
      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
