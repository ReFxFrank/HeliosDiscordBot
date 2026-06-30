'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Folder, Hash, Search, Volume2, X } from 'lucide-react';
import type { ChannelOption, RoleOption } from '../../lib/discord-guild';

export interface PickerOption {
  id: string;
  label: string;
  /** Role color (decimal RGB); 0 / undefined → default grey dot. */
  color?: number;
  /** Discord channel type → picks the channel icon. */
  channelType?: number;
}

const VOICE_TYPES = new Set([2, 13]);
const CATEGORY_TYPE = 4;
const DEFAULT_ROLE_COLOR = '#99aab5';

function colorHex(color?: number): string {
  if (!color) return DEFAULT_ROLE_COLOR;
  return `#${color.toString(16).padStart(6, '0')}`;
}

function OptionGlyph({ option }: { option: PickerOption }): React.ReactNode {
  if (option.channelType !== undefined) {
    if (VOICE_TYPES.has(option.channelType)) return <Volume2 className="h-3.5 w-3.5 text-white/45" />;
    if (option.channelType === CATEGORY_TYPE) return <Folder className="h-3.5 w-3.5 text-white/45" />;
    return <Hash className="h-3.5 w-3.5 text-white/45" />;
  }
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: colorHex(option.color) }}
    />
  );
}

const triggerClass =
  'flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/90 outline-none focus:border-[var(--color-blurple)]/60';

export function EntitySelect({
  options,
  selected,
  onChange,
  multiple = false,
  placeholder = 'Select…',
  kind = 'role',
}: {
  options: PickerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  kind?: 'role' | 'channel';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Graceful fallback when the bot token isn't available, so the field still works.
  if (options.length === 0) {
    const text = selected.join(', ');
    return (
      <input
        className={`${triggerClass} font-mono`}
        value={text}
        placeholder={`${kind === 'role' ? 'Role' : 'Channel'} ID${multiple ? 's (comma-separated)' : ''}`}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, multiple ? undefined : 1),
          )
        }
      />
    );
  }

  function toggle(id: string): void {
    if (multiple) {
      onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      onChange(selected[0] === id ? [] : [id]);
      setOpen(false);
    }
  }

  const selectedOptions = selected.map((id) => byId.get(id) ?? { id, label: id });
  const single = selectedOptions[0];

  return (
    <div ref={containerRef} className="relative">
      <button type="button" className={triggerClass} onClick={() => setOpen((o) => !o)}>
        <span className="flex flex-1 flex-wrap items-center gap-1.5 text-left">
          {selectedOptions.length === 0 ? (
            <span className="text-white/30">{placeholder}</span>
          ) : multiple ? (
            selectedOptions.map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-xs"
              >
                <OptionGlyph option={o} />
                <span className="max-w-[160px] truncate">{o.label}</span>
                <X
                  className="h-3 w-3 text-white/40 hover:text-white/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(selected.filter((s) => s !== o.id));
                  }}
                />
              </span>
            ))
          ) : single ? (
            <span className="inline-flex items-center gap-1.5">
              <OptionGlyph option={single} />
              {single.label}
            </span>
          ) : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-white/10 bg-[#1a1b26] shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-white/30" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kind === 'role' ? 'roles' : 'channels'}…`}
              className="w-full bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-white/40">No matches.</p>
            ) : (
              filtered.map((option) => {
                const isSelected = selected.includes(option.id);
                return (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => toggle(option.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-white/85 hover:bg-white/[0.06]"
                  >
                    <OptionGlyph option={option} />
                    <span className="flex-1 truncate">{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 text-[var(--color-blurple)]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Typed wrappers (map Discord entities → picker options) ───────────────────

const TEXT_CHANNEL_TYPES = [0, 5, 15];
const VOICE_CHANNEL_TYPES_ARR = [2, 13];

/** Role picker. Pass `selected` as an array (use `[value]` / `ids[0]` for single). */
export function RoleSelect({
  roles,
  selected,
  onChange,
  multiple = false,
  placeholder,
}: {
  roles: RoleOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
}) {
  return (
    <EntitySelect
      kind="role"
      multiple={multiple}
      placeholder={placeholder ?? (multiple ? 'Add roles…' : 'Select a role…')}
      options={roles.map((r) => ({ id: r.id, label: r.name, color: r.color }))}
      selected={selected}
      onChange={onChange}
    />
  );
}

/** Channel picker. `only` narrows to text or voice channels. */
export function ChannelSelect({
  channels,
  selected,
  onChange,
  multiple = false,
  placeholder,
  only,
}: {
  channels: ChannelOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  only?: 'text' | 'voice';
}) {
  const list =
    only === 'text'
      ? channels.filter((c) => TEXT_CHANNEL_TYPES.includes(c.type))
      : only === 'voice'
        ? channels.filter((c) => VOICE_CHANNEL_TYPES_ARR.includes(c.type))
        : channels;
  return (
    <EntitySelect
      kind="channel"
      multiple={multiple}
      placeholder={placeholder ?? (multiple ? 'Add channels…' : 'Select a channel…')}
      options={list.map((c) => ({ id: c.id, label: c.name, channelType: c.type }))}
      selected={selected}
      onChange={onChange}
    />
  );
}
