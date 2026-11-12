'use client';

import { useRef, useState, useTransition } from 'react';
import { Download, Upload } from 'lucide-react';
import { BRAND } from '@refx/shared';
import { exportGuildConfig, importGuildConfig } from '../lib/config-transfer';
import { GlassCard } from './ui/glass-card';

/** Settings-page card: download the server's whole module config / replay one. */
export function ConfigTransfer({ guildId }: { guildId: string }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onExport(): void {
    startTransition(async () => {
      try {
        const json = await exportGuildConfig(guildId);
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `bot-config-${guildId}.json`;
        link.click();
        URL.revokeObjectURL(url);
        setStatus({ tone: 'ok', text: 'Config exported.' });
      } catch {
        setStatus({ tone: 'error', text: 'Export failed — try again.' });
      }
    });
  }

  function onImportFile(file: File): void {
    if (
      !window.confirm(
        'Import this file? It overwrites module settings on this server (modules in the file only).',
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const raw = await file.text();
        const result = await importGuildConfig(guildId, raw);
        if (!result.ok) {
          setStatus({ tone: 'error', text: result.error ?? 'Import failed.' });
          return;
        }
        const skippedNote = result.skipped.length > 0 ? ` · ${result.skipped.length} skipped` : '';
        setStatus({
          tone: 'ok',
          text: `Imported ${result.applied.length} module${result.applied.length === 1 ? '' : 's'}${skippedNote}.`,
        });
      } catch {
        setStatus({ tone: 'error', text: `Import failed — is that a ${BRAND.name} export file?` });
      }
    });
  }

  return (
    <GlassCard className="p-5">
      <h3 className="font-semibold text-white/90">Backup &amp; transfer</h3>
      <p className="mt-1 text-sm text-white/50">
        Export this server’s entire module configuration as JSON — keep it as a backup or import it
        into another server running {BRAND.name}. Imports are validated module-by-module.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Export config
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> Import config
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onImportFile(file);
          }}
        />
        {status && (
          <span
            className={`text-sm ${status.tone === 'ok' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
          >
            {status.text}
          </span>
        )}
      </div>
    </GlassCard>
  );
}
