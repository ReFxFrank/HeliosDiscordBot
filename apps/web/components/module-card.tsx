import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ModuleMeta } from '../lib/modules';
import { cn } from '../lib/utils';
import { GlassCard } from './ui/glass-card';
import { ModuleToggle } from './module-toggle';

export function ModuleCard({
  guildId,
  meta,
  enabled,
}: {
  guildId: string;
  meta: ModuleMeta;
  enabled: boolean;
}) {
  const Icon = meta.icon;
  return (
    <GlassCard
      className={cn('flex flex-col gap-3 p-4 transition-opacity', !enabled && 'opacity-60')}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            enabled ? 'bg-[var(--color-blurple)]/15 text-white' : 'bg-white/5 text-white/50',
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-medium text-white/90">{meta.name}</h3>
            <ModuleToggle
              guildId={guildId}
              module={meta.module}
              initialEnabled={enabled}
              label={meta.name}
            />
          </div>
          <p className="mt-0.5 text-xs text-white/50">{meta.description}</p>
        </div>
      </div>
      {meta.configSlug && (
        <Link
          href={`/servers/${guildId}/${meta.configSlug}`}
          className="inline-flex items-center gap-1 self-start text-xs font-medium text-[var(--color-info)] hover:underline"
        >
          Configure <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </GlassCard>
  );
}
