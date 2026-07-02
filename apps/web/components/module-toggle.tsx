'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Module } from '@solari/shared';
import { setModuleEnabled } from '../lib/config-actions';
import { Switch } from './ui/switch';

export function ModuleToggle({
  guildId,
  module,
  initialEnabled,
  label,
}: {
  guildId: string;
  module: Module;
  initialEnabled: boolean;
  label: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Server-driven changes must win over the optimistic local state — e.g. the
  // bulk enable/disable-all buttons revalidating the page.
  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  function toggle(next: boolean): void {
    setEnabled(next); // optimistic
    startTransition(async () => {
      try {
        await setModuleEnabled(guildId, module, next);
        // Re-fetch the server tree so the status chip, "Modules on" stat, and
        // any Configure links reflect the change without a manual refresh.
        router.refresh();
      } catch {
        setEnabled(!next); // revert on failure
      }
    });
  }

  return (
    <Switch checked={enabled} disabled={pending} onChange={toggle} label={`Toggle ${label}`} />
  );
}
