'use client';

import { useState, useTransition } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { customCommandInputSchema, type CustomCommandInput, type EmbedSpec } from '@refx/shared';
import { deleteCustomCommand, upsertCustomCommand } from '../lib/customcommands-actions';
import { GlassCard } from './ui/glass-card';
import { Field, SaveBar, monoInputClass, type SaveStatus } from './ui/form';
import {
  EMPTY_EMBED_DRAFT,
  EmbedBuilder,
  draftToSpec,
  specToDraft,
  type EmbedDraft,
} from './ui/embed-builder';

export interface TagSummary {
  name: string;
  content: string | null;
  embed: EmbedSpec | null;
  uses: number;
}

interface FormState {
  name: string;
  content: string;
  embed: EmbedDraft;
}

const emptyForm: FormState = { name: '', content: '', embed: EMPTY_EMBED_DRAFT };

const TAG_VARIABLES = [
  { token: '{user}', desc: "The invoker's mention" },
  { token: '{server}', desc: 'The server name' },
];

function buildInput(form: FormState): CustomCommandInput {
  return {
    name: form.name.trim().toLowerCase(),
    content: form.content.trim() || undefined,
    embed: draftToSpec(form.embed),
  };
}

function formFromTag(tag: TagSummary): FormState {
  return {
    name: tag.name,
    content: tag.content ?? '',
    embed: specToDraft(tag.embed),
  };
}

export function CustomCommandsManager({ guildId, tags }: { guildId: string; tags: TagSummary[] }) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
    setError(null);
  }

  function save(): void {
    const candidate = buildInput(form);
    const parsed = customCommandInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid tag.');
      setStatus('error');
      return;
    }
    startTransition(async () => {
      const result = await upsertCustomCommand(guildId, candidate);
      if (result.ok) {
        setForm(emptyForm);
        setStatus('saved');
      } else {
        setError(result.error ?? 'Could not save.');
        setStatus('error');
      }
    });
  }

  function remove(name: string): void {
    startTransition(async () => {
      await deleteCustomCommand(guildId, name);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="flex flex-col gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tag name" hint="lowercase, no spaces — invoked as {prefix}name.">
            <input
              className={monoInputClass}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="rules"
            />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-white/80">Message builder</p>
          <p className="mb-3 text-xs text-white/45">
            A plain message, a rich embed, or both. Supports {'{user}'} and {'{server}'}.
          </p>
          <EmbedBuilder
            value={form.embed}
            onChange={(embed) => set('embed', embed)}
            variables={TAG_VARIABLES}
            content={form.content}
            onContentChange={(v) => set('content', v)}
          />
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <SaveBar
          pending={pending}
          status={status}
          onSave={save}
          label="Save tag"
          savedMessage="Saved."
        />
      </GlassCard>

      {tags.length > 0 && (
        <GlassCard className="divide-y divide-white/5 p-0">
          {tags.map((tag) => (
            <div key={tag.name} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono font-medium text-white/90">{tag.name}</p>
                <p className="truncate text-xs text-white/40">
                  {tag.embed ? '[embed] ' : ''}
                  {tag.content ?? ''} · {tag.uses} uses
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm(formFromTag(tag))}
                title="Edit"
                className="rounded-md border border-white/10 p-1.5 text-white/60 hover:text-white"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(tag.name)}
                disabled={pending}
                title="Delete"
                className="rounded-md border border-white/10 p-1.5 text-white/60 hover:text-[var(--color-danger)] disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
