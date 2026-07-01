'use client';

import { useState, useTransition } from 'react';
import type { AutoroleConfig } from '@solari/shared';
import type { RoleOption } from '../lib/discord-guild';
import { saveAutoroleConfig } from '../lib/config-actions';
import { Field, SaveBar, type SaveStatus } from './ui/form';
import { RoleSelect } from './ui/entity-select';

export function AutoroleForm({
  guildId,
  initial,
  roles,
}: {
  guildId: string;
  initial: AutoroleConfig;
  roles: RoleOption[];
}) {
  const [config, setConfig] = useState<AutoroleConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof AutoroleConfig>(key: K, value: AutoroleConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveAutoroleConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Roles for humans" hint="Roles granted to people on join.">
        <RoleSelect
          roles={roles}
          multiple
          selected={config.humanRoleIds}
          onChange={(ids) => update('humanRoleIds', ids)}
        />
      </Field>

      <Field label="Roles for bots" hint="Roles granted to bots on join.">
        <RoleSelect
          roles={roles}
          multiple
          selected={config.botRoleIds}
          onChange={(ids) => update('botRoleIds', ids)}
        />
      </Field>

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
