'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import type { EmbedSpec } from '@solari/shared';
import type { ChannelOption } from '../lib/discord-guild';
import { deleteEmbed, deploySavedEmbed, saveEmbed } from '../lib/embed-actions';
import {
  draftHasContent,
  draftToSpec,
  EmbedBuilder,
  EMPTY_EMBED_DRAFT,
  specToDraft,
  type EmbedDraft,
} from './ui/embed-builder';
import { ChannelSelect } from './ui/entity-select';
import { Field } from './ui/form';

export interface SavedEmbedDTO {
  id: string;
  name: string;
  content: string;
  spec: EmbedSpec;
  channelId: string | null;
  messageId: string | null;
}

interface EditorState {
  /** Null while creating a new embed. */
  id: string | null;
  name: string;
  content: string;
  draft: EmbedDraft;
}

export function EmbedsManager({
  guildId,
  embeds,
  channels,
}: {
  guildId: string;
  embeds: SavedEmbedDTO[];
  channels: ChannelOption[];
}) {
  const router = useRouter();
  // The list renders from local state so mutations show instantly — waiting on
  // the RSC round-trip left saves invisible until a manual refresh. The
  // router.refresh() calls stay as reconciliation (e.g. they pull in the
  // messageId the bot writes after a deploy).
  const [items, setItems] = useState<SavedEmbedDTO[]>(embeds);
  // Adopt fresh server data whenever a refresh delivers new props (its DB read
  // happens after our writes, so it's authoritative — e.g. it carries the
  // messageId the bot stored after a deploy).
  const [serverItems, setServerItems] = useState<SavedEmbedDTO[]>(embeds);
  if (embeds !== serverItems) {
    setServerItems(embeds);
    setItems(embeds);
  }
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [deployTarget, setDeployTarget] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const channelName = (id: string | null): string | null => {
    if (!id) return null;
    return channels.find((c) => c.id === id)?.name ?? id;
  };

  function report(ok: boolean, text: string): void {
    setFailed(!ok);
    setMsg(text);
  }

  function save(): void {
    if (!editing) return;
    setMsg(null);
    startTransition(async () => {
      const spec = draftToSpec(editing.draft) ?? {};
      const result = await saveEmbed(guildId, {
        id: editing.id,
        name: editing.name,
        content: editing.content,
        spec,
      });
      if (result.ok && result.id) {
        const saved: SavedEmbedDTO = {
          id: result.id,
          name: editing.name.trim(),
          content: editing.content.trim(),
          spec,
          channelId: items.find((e) => e.id === result.id)?.channelId ?? null,
          messageId: items.find((e) => e.id === result.id)?.messageId ?? null,
        };
        setItems(
          editing.id
            ? items.map((e) => (e.id === result.id ? saved : e))
            : [saved, ...items],
        );
        setEditing(null);
        report(true, 'Embed saved.');
        router.refresh();
      } else {
        report(false, result.error ?? 'Could not save the embed.');
      }
    });
  }

  function remove(embed: SavedEmbedDTO): void {
    if (!window.confirm(`Delete "${embed.name}"? The posted message (if any) stays in Discord.`)) {
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const result = await deleteEmbed(guildId, embed.id);
      report(result.ok, result.ok ? 'Embed deleted.' : (result.error ?? 'Could not delete.'));
      if (result.ok) {
        setItems(items.filter((e) => e.id !== embed.id));
        router.refresh();
      }
    });
  }

  function deploy(embed: SavedEmbedDTO): void {
    const channelId = deployTarget[embed.id] ?? embed.channelId ?? '';
    setMsg(null);
    startTransition(async () => {
      const result = await deploySavedEmbed(guildId, embed.id, channelId);
      if (result.ok) {
        const inPlace = Boolean(embed.messageId) && channelId === embed.channelId;
        setItems(
          items.map((e) =>
            e.id === embed.id
              ? { ...e, channelId, messageId: inPlace ? e.messageId : null }
              : e,
          ),
        );
        report(
          true,
          inPlace
            ? 'Update sent — the posted message is being edited in place.'
            : 'Deploy sent — the embed should appear in the channel within a second.',
        );
        router.refresh();
      } else {
        report(false, result.error ?? 'Could not deploy.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Editor */}
      {editing ? (
        <div className="glass flex flex-col gap-4 rounded-2xl p-5">
          <Field label="Embed name" hint="Only shown in the dashboard — pick something recognizable, like “read-me”.">
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              maxLength={64}
              placeholder="read-me"
              className="w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-[var(--color-brand)]/60"
            />
          </Field>
          <EmbedBuilder
            value={editing.draft}
            onChange={(draft) => setEditing({ ...editing, draft })}
            content={editing.content}
            onContentChange={(content) => setEditing({ ...editing, content })}
            contentPlaceholder="Optional message shown above the embed"
          />
          {editing.content.trim() && !draftHasContent(editing.draft) && (
            <p className="text-sm font-medium text-[var(--color-warning)]">
              Heads up: the Message box posts as plain text. For the embed card (colored bar,
              title, fields), put your text in the embed&apos;s <b>Description</b> below — the
              Message box is only for an optional line above it.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand)] disabled:opacity-40"
            >
              {editing.id ? 'Save changes' : 'Save embed'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={pending}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.06]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setEditing({ id: null, name: '', content: '', draft: EMPTY_EMBED_DRAFT })}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand)]"
          >
            <Plus className="h-4 w-4" /> New embed
          </button>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${failed ? 'font-medium text-[var(--color-danger)]' : 'text-white/60'}`}>
          {msg}
        </p>
      )}

      {/* Saved embeds */}
      {items.length === 0 && !editing ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-white/50">
          No embeds yet. Build one and deploy it to any channel — rules, read-me, FAQs, announcements.
        </div>
      ) : (
        items.map((embed) => {
          const target = deployTarget[embed.id] ?? embed.channelId ?? '';
          const willEditInPlace = Boolean(embed.messageId) && target === embed.channelId;
          return (
            <div key={embed.id} className="glass flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white/90">{embed.name}</p>
                  <p className="text-xs text-white/45">
                    {embed.messageId && embed.channelId
                      ? `Posted in #${channelName(embed.channelId)} — deploying again updates it in place.`
                      : 'Not posted yet.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: embed.id,
                        name: embed.name,
                        content: embed.content,
                        draft: specToDraft(embed.spec),
                      })
                    }
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(embed)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-danger)]/30 px-3 py-1.5 text-sm text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-64">
                  <ChannelSelect
                    channels={channels}
                    only="text"
                    selected={target ? [target] : []}
                    onChange={(ids) => setDeployTarget({ ...deployTarget, [embed.id]: ids[0] ?? '' })}
                    placeholder="Deploy to channel…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => deploy(embed)}
                  disabled={pending || !target}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                >
                  <Send className="h-4 w-4" /> {willEditInPlace ? 'Update message' : 'Deploy'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
