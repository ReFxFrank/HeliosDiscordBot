'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, Hash, Loader2, Megaphone, MessagesSquare, Trash2, Volume2 } from 'lucide-react';
import type { ChannelOption } from '../lib/discord-guild';
import { deleteChannels } from '../lib/channel-actions';
import { cn } from '../lib/utils';

const KIND_OF: Record<number, 'category' | 'text' | 'voice'> = {
  0: 'text',
  5: 'text',
  15: 'text',
  2: 'voice',
  13: 'voice',
  4: 'category',
};

const GROUPS: { kind: 'category' | 'text' | 'voice'; label: string }[] = [
  { kind: 'category', label: 'Categories' },
  { kind: 'text', label: 'Text & announcement' },
  { kind: 'voice', label: 'Voice & stage' },
];

function ChannelIcon({ type }: { type: number }) {
  const cls = 'h-4 w-4 shrink-0 text-white/45';
  if (type === 2 || type === 13) return <Volume2 className={cls} />;
  if (type === 4) return <Folder className={cls} />;
  if (type === 5) return <Megaphone className={cls} />;
  if (type === 15) return <MessagesSquare className={cls} />;
  return <Hash className={cls} />;
}

export function ChannelManager({
  guildId,
  channels,
}: {
  guildId: string;
  channels: ChannelOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return GROUPS.map((group) => ({
      ...group,
      items: channels.filter((c) => KIND_OF[c.type] === group.kind),
    })).filter((group) => group.items.length > 0);
  }, [channels]);

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMsg(null);
  }

  function toggleGroup(ids: string[], allSelected: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setMsg(null);
  }

  function clearAll(): void {
    setSelected(new Set());
    setMsg(null);
  }

  function remove(): void {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} channel${ids.length === 1 ? '' : 's'}? This is permanent and cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteChannels(guildId, ids);
      setSelected(new Set());
      setMsg(
        result.error
          ? result.error
          : `Deleted ${result.deleted} channel${result.deleted === 1 ? '' : 's'}` +
              (result.failed ? ` — ${result.failed} could not be deleted (check my permissions).` : '.'),
      );
      router.refresh();
    });
  }

  if (channels.length === 0) {
    return (
      <p className="text-sm text-white/45">
        No channels found — the bot may be missing access, or its token isn’t configured on this
        instance.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        {grouped.map((group) => {
          const ids = group.items.map((c) => c.id);
          const allSelected = ids.every((id) => selected.has(id));
          return (
            <div key={group.kind} className="glass rounded-2xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/80">
                  {group.label}{' '}
                  <span className="font-normal text-white/40">({group.items.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => toggleGroup(ids, allSelected)}
                  className="text-xs font-medium text-white/50 transition-colors hover:text-white/85"
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {group.items.map((channel) => {
                  const isSelected = selected.has(channel.id);
                  return (
                    <label
                      key={channel.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                        isSelected ? 'bg-[var(--color-danger)]/15' : 'hover:bg-white/[0.04]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(channel.id)}
                        className="h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 accent-[var(--color-danger)]"
                      />
                      <ChannelIcon type={channel.type} />
                      <span className="min-w-0 truncate text-white/85">{channel.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[var(--color-base-elevated)]/90 px-4 py-3 backdrop-blur">
        <span className="text-sm text-white/70">
          <strong className="text-white/90">{selected.size}</strong> selected
        </span>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-xs text-white/55">{msg}</span>}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={clearAll}
              disabled={pending}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={pending || selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-danger)]/15 px-3.5 py-1.5 text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/25 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete selected
          </button>
        </div>
      </div>
    </div>
  );
}
