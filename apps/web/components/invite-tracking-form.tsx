'use client';

import { useState, useTransition } from 'react';
import type { InviteTrackingConfig } from '@helios/shared';
import { saveInviteTrackingConfig } from '../lib/config-actions';
import { Field, SaveBar, monoInputClass, type SaveStatus } from './ui/form';

export function InviteTrackingForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: InviteTrackingConfig;
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
        label="Join-log channel ID"
        hint="Posts “X joined, invited by Y”. Blank disables the log (counts still track)."
      >
        <input
          className={monoInputClass}
          value={config.logChannelId ?? ''}
          onChange={(e) => {
            setConfig({ logChannelId: e.target.value.trim() || null });
            setStatus('idle');
          }}
          placeholder="optional"
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
