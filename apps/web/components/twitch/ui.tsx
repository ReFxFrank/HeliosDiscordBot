'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import {
  TWITCH_MESSAGE_MAX,
  TWITCH_PERMISSIONS,
  TWITCH_PERMISSION_LABELS,
  TWITCH_RESPONSE_TYPES,
  TWITCH_RESPONSE_TYPE_LABELS,
  TWITCH_VARIABLES,
  type TwitchChatConfig,
  type TwitchPermission,
  type TwitchResponseType,
  type TwitchSection,
} from '@refx/shared';
import { saveTwitchSection } from '../../lib/twitch-chat-actions';
import { SaveBar, inputClass, type SaveStatus } from '../ui/form';
import { Switch } from '../ui/switch';

/** Shared building blocks for the Twitch dashboard pages. */

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white/90">{title}</h2>
      {children && <p className="text-sm text-white/50">{children}</p>}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
}) {
  return (
    <input
      type="number"
      className={inputClass}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
    />
  );
}

export function PermissionSelect({
  value,
  onChange,
}: {
  value: TwitchPermission;
  onChange: (next: TwitchPermission) => void;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value as TwitchPermission)}
    >
      {TWITCH_PERMISSIONS.map((level) => (
        <option key={level} value={level}>
          {TWITCH_PERMISSION_LABELS[level]}
        </option>
      ))}
    </select>
  );
}

export function ResponseTypeSelect({
  value,
  onChange,
}: {
  value: TwitchResponseType;
  onChange: (next: TwitchResponseType) => void;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value as TwitchResponseType)}
    >
      {TWITCH_RESPONSE_TYPES.map((type) => (
        <option key={type} value={type}>
          {TWITCH_RESPONSE_TYPE_LABELS[type]}
        </option>
      ))}
    </select>
  );
}

/** Message box with a grouped $(variable) picker. */
export function TemplateInput({
  value,
  onChange,
  placeholder,
  extraVariables,
  rows = 3,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Alert-specific variables shown first, e.g. "$(user) $(months)". */
  extraVariables?: string;
  rows?: number;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<string, typeof TWITCH_VARIABLES>();
    for (const variable of TWITCH_VARIABLES) {
      map.set(variable.group, [...(map.get(variable.group) ?? []), variable]);
    }
    return [...map.entries()];
  }, []);
  const insert = (token: string) =>
    onChange(`${value}${value && !value.endsWith(' ') ? ' ' : ''}${token}`);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        className={`${inputClass} resize-y`}
        rows={rows}
        value={value}
        maxLength={TWITCH_MESSAGE_MAX}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {extraVariables
          ?.split(/\s+/)
          .filter(Boolean)
          .map((token) => (
            <Chip key={token} onClick={() => insert(token)}>
              {token}
            </Chip>
          ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/60 hover:text-white"
        >
          {open ? 'Hide variables' : 'All variables…'}
        </button>
        <span className="ml-auto text-[11px] text-white/35">
          {value.length}/{TWITCH_MESSAGE_MAX}
        </span>
      </div>
      {open && (
        <div className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
          {groups.map(([group, variables]) => (
            <div key={group} className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {group}
              </p>
              {variables.map((variable) => (
                <button
                  key={variable.token}
                  type="button"
                  onClick={() => insert(variable.token)}
                  className="flex items-baseline gap-2 rounded px-1 text-left hover:bg-white/[0.05]"
                >
                  <code className="shrink-0 text-[11px] text-[var(--color-brand-bright)]">
                    {variable.token}
                  </code>
                  <span className="truncate text-[11px] text-white/50">{variable.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Chip({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-white/60 hover:text-white"
    >
      {children}
    </button>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div>
        <p className="text-sm text-white/90">{title}</p>
        {description && <p className="text-xs text-white/50">{description}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** A collapsible list item with an enable switch and remove button. */
export function ItemCard({
  title,
  subtitle,
  enabled,
  open,
  onToggle,
  onEnabled,
  onRemove,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  enabled: boolean;
  open: boolean;
  onToggle: () => void;
  onEnabled: (next: boolean) => void;
  onRemove: () => void;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-white/50" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-white/50" />
          )}
          <span
            className={`truncate font-mono text-sm ${enabled ? 'text-white/90' : 'text-white/40'}`}
          >
            {title}
          </span>
          {badge}
          {subtitle && <span className="truncate text-xs text-white/40">{subtitle}</span>}
        </button>
        <Switch checked={enabled} onChange={onEnabled} label={`Enable ${title}`} />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="rounded-md p-1.5 text-white/40 hover:text-[var(--color-danger)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && <div className="flex flex-col gap-4 border-t border-white/10 p-4">{children}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'purple' | 'warn';
}) {
  const color =
    tone === 'purple'
      ? 'border-[#9146FF]/40 text-[#c9a8ff]'
      : tone === 'warn'
        ? 'border-[var(--color-warning)]/40 text-[var(--color-warning)]'
        : 'border-white/15 text-white/45';
  return (
    <span className={`shrink-0 rounded border px-1.5 py-px text-[10px] ${color}`}>{children}</span>
  );
}

/**
 * Local state for one settings section plus a save bar that saves just that
 * section. `validate` returns a problem to show instead of saving.
 */
export function useSection<S extends TwitchSection>(
  guildId: string,
  section: S,
  initial: TwitchChatConfig[S],
  validate?: (value: TwitchChatConfig[S]) => string | null,
  /** Tidy the value before validating and saving (drop blank lines…). */
  prepare?: (value: TwitchChatConfig[S]) => TwitchChatConfig[S],
) {
  const [value, setValue] = useState<TwitchChatConfig[S]>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (
    next: TwitchChatConfig[S] | ((prev: TwitchChatConfig[S]) => TwitchChatConfig[S]),
  ) => {
    setValue(next);
    setStatus('idle');
    setError(null);
  };

  const save = () => {
    const ready = prepare ? prepare(value) : value;
    const problem = validate?.(ready) ?? null;
    if (problem) {
      setError(problem);
      setStatus('error');
      return;
    }
    startTransition(async () => {
      const result = await saveTwitchSection(guildId, section, ready);
      if (result.ok && prepare) setValue(ready);
      setError(result.ok ? null : (result.error ?? 'Could not save.'));
      setStatus(result.ok ? 'saved' : 'error');
    });
  };

  const bar = (
    <div className="flex flex-col gap-2 pt-1">
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );

  return { value, update, bar };
}
