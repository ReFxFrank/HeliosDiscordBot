'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown, GripVertical, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import {
  rolePanelProblems,
  rolePanelModes,
  rolePanelTypes,
  type RolePanelInput,
  type RolePanelMode,
  type RolePanelType,
} from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import {
  createRolePanel,
  deleteRolePanel,
  redeployRolePanel,
  updateRolePanel,
} from '../lib/panel-actions';
import { GlassCard } from './ui/glass-card';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { MessagePreviewShell } from './ui/embed-builder';

export interface PanelSummary {
  id: string;
  title: string;
  description: string | null;
  mode: string;
  type: string;
  channelId: string | null;
  messageId: string | null;
  options: { roleId: string; label: string; emoji?: string; description?: string }[];
}

interface OptionDraft {
  roleId: string;
  label: string;
  emoji: string;
  description: string;
}

interface FormState {
  /** The existing panel being edited, or null when creating a new one. */
  editingId: string | null;
  title: string;
  description: string;
  channelId: string;
  mode: RolePanelMode;
  type: RolePanelType;
  options: OptionDraft[];
}

const emptyOption: OptionDraft = { roleId: '', label: '', emoji: '', description: '' };
const emptyForm: FormState = {
  editingId: null,
  title: '',
  description: '',
  channelId: '',
  mode: 'NORMAL',
  type: 'BUTTON',
  options: [{ ...emptyOption }],
};

const MODE_HINT: Record<RolePanelMode, string> = {
  NORMAL: 'Members can toggle any role on or off.',
  UNIQUE: 'Only one role from this panel at a time (picking a new one drops the old).',
  VERIFY: 'One-way — the role can be claimed but not removed here.',
};

/** A short curated palette so the emoji field feels like a picker without a dependency. */
const QUICK_EMOJI = ['📣', '🔔', '🎮', '🎨', '💬', '🛠️', '⭐', '🚀', '❤️', '✅', '🎉', '📚'];

function EmojiField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Close on a click elsewhere or Escape, like the channel and role pickers.
  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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
  // A custom emoji is typed as <:name:id>; show just :name: so it fits the button.
  const custom = /^<a?:(\w+):\d+>$/.exec(value.trim());
  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-11 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/[0.03] text-lg hover:border-[var(--color-brand)]/60"
        title={value ? `Emoji: ${value}` : 'Emoji (optional)'}
      >
        {custom ? (
          <span className="truncate px-0.5 text-[10px] text-white/70">:{custom[1]}:</span>
        ) : (
          value || <span className="text-xs text-white/30">＋</span>
        )}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-56 rounded-lg border border-white/10 bg-[var(--color-base-elevated)] p-2 shadow-xl">
          <div className="grid grid-cols-6 gap-1">
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onChange(emoji);
                  setOpen(false);
                }}
                className="rounded p-1 text-lg hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
          <input
            className={`${inputClass} mt-2 font-mono text-xs`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Or paste any emoji / <:name:id>"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PanelPreview({ form }: { form: FormState }) {
  const options = form.options.filter((o) => o.roleId);
  return (
    <MessagePreviewShell>
      {(form.title || form.description) && (
        <div
          className="mb-2 max-w-[440px] rounded-[4px] bg-[#2b2d31] px-3 py-2.5"
          style={{ borderLeft: '4px solid var(--color-brand)' }}
        >
          {form.title && <div className="mb-1 font-semibold text-white">{form.title}</div>}
          {form.description && (
            <div className="whitespace-pre-wrap break-words text-[13px] text-[#dbdee1]/90">
              {form.description}
            </div>
          )}
        </div>
      )}
      {options.length === 0 ? (
        <p className="text-xs text-[#949ba4]">Add a role to preview the panel.</p>
      ) : form.type === 'BUTTON' ? (
        <div className="flex flex-wrap gap-2">
          {options.map((o, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#4e5058] px-3 py-1.5 text-sm font-medium text-white"
            >
              {o.emoji && <span>{o.emoji}</span>}
              {o.label || 'Role'}
            </span>
          ))}
        </div>
      ) : (
        <div className="max-w-[440px] rounded-[4px] border border-black/40 bg-[#1e1f22] px-3 py-2 text-sm text-[#dbdee1]/70">
          <div className="flex items-center justify-between">
            <span>Select roles…</span>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      )}
    </MessagePreviewShell>
  );
}

export function RolePanels({
  guildId,
  panels,
  roles,
  channels,
}: {
  guildId: string;
  panels: PanelSummary[];
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [listMessage, setListMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastSaveWasEdit, setLastSaveWasEdit] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // The draft lives in this browser until the panel is really created, so a
  // failed post, a reload or a dashboard update can never throw the work away.
  const draftKey = `role-panel-draft:${guildId}`;
  const draftLoaded = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      const saved = raw ? (JSON.parse(raw) as Partial<FormState>) : null;
      if (saved && Array.isArray(saved.options) && saved.options.length > 0) {
        setForm({ ...emptyForm, ...saved });
        setRestored(true);
      }
    } catch {
      /* unreadable draft: start blank */
    }
    draftLoaded.current = true;
  }, [draftKey]);
  useEffect(() => {
    if (!draftLoaded.current) return;
    try {
      const touched =
        form.editingId ||
        form.title ||
        form.description ||
        form.options.some((o) => o.roleId || o.label);
      if (touched) window.localStorage.setItem(draftKey, JSON.stringify(form));
      else window.localStorage.removeItem(draftKey);
    } catch {
      /* storage unavailable: the form still works */
    }
  }, [form, draftKey]);

  const roleName = (id: string): string => roles.find((r) => r.id === id)?.name ?? '';

  function patch(partial: Partial<FormState>): void {
    setForm((f) => ({ ...f, ...partial }));
    setStatus('idle');
    setError(null);
    setNotice(null);
  }
  function patchOption(index: number, partial: Partial<OptionDraft>): void {
    patch({ options: form.options.map((o, i) => (i === index ? { ...o, ...partial } : o)) });
  }
  function setRole(index: number, roleId: string): void {
    // Default the label to the role name when the label is still blank.
    const current = form.options[index];
    const label = current && current.label.trim() ? current.label : roleName(roleId);
    patchOption(index, { roleId, label });
  }
  function addOption(): void {
    if (form.options.length >= 25) return;
    patch({ options: [...form.options, { ...emptyOption }] });
  }
  function removeOption(index: number): void {
    const next = form.options.filter((_, i) => i !== index);
    patch({ options: next.length > 0 ? next : [{ ...emptyOption }] });
  }

  function buildCandidate(): RolePanelInput {
    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      channelId: form.channelId || null,
      mode: form.mode,
      type: form.type,
      options: form.options
        .filter((o) => o.roleId && o.label.trim())
        .map((o) => ({
          roleId: o.roleId,
          label: o.label.trim(),
          emoji: o.emoji.trim() || undefined,
          description:
            form.type === 'SELECT' && o.description.trim() ? o.description.trim() : undefined,
        })),
    };
  }

  function failWith(message: string): void {
    setError(message);
    setNotice(null);
    setStatus('error');
  }

  function create(): void {
    const candidate = buildCandidate();
    const problems = rolePanelProblems(candidate);
    // Rows the builder would silently drop: say so instead of posting without them.
    if (form.options.some((o) => Boolean(o.roleId) !== Boolean(o.label.trim()))) {
      problems.push('Every role row needs both a role and a label (or remove the empty row).');
    }
    if (problems.length > 0) {
      failWith(problems.join(' '));
      return;
    }
    setRestored(false);
    const editingId = form.editingId;
    startTransition(async () => {
      try {
        const result = editingId
          ? await updateRolePanel(guildId, editingId, candidate)
          : await createRolePanel(guildId, candidate);
        if (result.ok) {
          // Done for certain, so the draft must not come back after a reload.
          try {
            window.localStorage.removeItem(draftKey);
          } catch {
            // Storage unavailable: nothing was saved there either.
          }
          setLastSaveWasEdit(Boolean(editingId));
          setForm(emptyForm);
          setError(null);
          setNotice(result.notice ?? null);
          setStatus('saved');
        } else {
          failWith(result.error ?? 'The panel could not be saved.');
        }
      } catch {
        // The request itself failed: offline, or the dashboard was updated
        // while this page was open. The draft is kept either way.
        failWith(
          "Couldn't reach the dashboard. If it was just updated, reload this page: your panel is saved as a draft and will still be here.",
        );
      }
    });
  }

  /** Load a posted panel into the form; saving then updates its message in place. */
  function startEditing(panel: PanelSummary): void {
    setForm({
      editingId: panel.id,
      title: panel.title,
      description: panel.description ?? '',
      channelId: panel.channelId ?? '',
      mode: (rolePanelModes as readonly string[]).includes(panel.mode)
        ? (panel.mode as RolePanelMode)
        : 'NORMAL',
      type: (rolePanelTypes as readonly string[]).includes(panel.type)
        ? (panel.type as RolePanelType)
        : 'BUTTON',
      options:
        panel.options.length > 0
          ? panel.options.map((o) => ({
              roleId: o.roleId,
              label: o.label,
              emoji: o.emoji ?? '',
              description: o.description ?? '',
            }))
          : [{ ...emptyOption }],
    });
    setRestored(false);
    setError(null);
    setNotice(null);
    setStatus('idle');
    setListMessage(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function discardDraft(): void {
    setForm(emptyForm);
    setRestored(false);
    setError(null);
    setNotice(null);
    setStatus('idle');
  }

  function redeploy(panelId: string): void {
    setListMessage(null);
    startTransition(async () => {
      try {
        const result = await redeployRolePanel(guildId, panelId);
        setListMessage(
          result.ok
            ? { ok: true, text: result.notice ? `Posted. ${result.notice}` : 'Posted.' }
            : { ok: false, text: result.error ?? 'The panel could not be posted.' },
        );
      } catch {
        setListMessage({
          ok: false,
          text: "Couldn't reach the dashboard. Reload and try again.",
        });
      }
    });
  }
  function remove(panelId: string): void {
    // Deleting the panel being edited: drop the edit, there is nothing to save to.
    if (form.editingId === panelId) discardDraft();
    startTransition(async () => {
      await deleteRolePanel(guildId, panelId);
    });
  }

  const editingTitle =
    panels.find((panel) => panel.id === form.editingId)?.title ?? (form.title || 'panel');

  const channelLabel = (id: string | null): string =>
    id ? (channels.find((c) => c.id === id)?.name ?? id) : 'no channel';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Panels</h3>
        {panels.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-white/40">No panels yet.</GlassCard>
        ) : (
          <GlassCard className="divide-y divide-white/5 p-0">
            {panels.map((panel) => (
              <div key={panel.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white/90">{panel.title}</p>
                  <p className="text-xs text-white/40">
                    {panel.type} · {panel.mode} · {panel.options.length} roles · #
                    {channelLabel(panel.channelId)} ·{' '}
                    {panel.messageId ? 'deployed' : 'not deployed'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startEditing(panel)}
                  disabled={pending}
                  title="Edit"
                  className={`rounded-md border p-1.5 hover:text-white disabled:opacity-40 ${
                    form.editingId === panel.id
                      ? 'border-[var(--color-brand)] text-white'
                      : 'border-white/10 text-white/60'
                  }`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => redeploy(panel.id)}
                  disabled={pending || !panel.channelId}
                  title="Deploy / redeploy"
                  className="rounded-md border border-white/10 p-1.5 text-white/60 hover:text-white disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(panel.id)}
                  disabled={pending}
                  title="Delete"
                  className="rounded-md border border-[var(--color-danger)]/30 p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </GlassCard>
        )}
        {listMessage ? (
          <p
            className={`mt-2 text-sm ${listMessage.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
          >
            {listMessage.text}
          </p>
        ) : null}
      </div>

      <div ref={formRef} className="scroll-mt-4">
        <GlassCard className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white/80">
              {form.editingId ? `Editing: ${editingTitle}` : 'New panel'}
            </h3>
            {form.editingId ? (
              <button
                type="button"
                onClick={discardDraft}
                className="text-xs text-white/50 underline hover:text-white"
              >
                Cancel editing
              </button>
            ) : restored ? (
              <span className="text-xs text-white/50">
                Restored your unsaved draft.
                <button
                  type="button"
                  onClick={discardDraft}
                  className="ml-1 underline hover:text-white"
                >
                  Start over
                </button>
              </span>
            ) : null}
          </div>
          <Field label="Title">
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Pick your roles"
            />
          </Field>
          <Field label="Description" hint="Optional text shown above the buttons.">
            <textarea
              rows={2}
              className={inputClass}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <Field label="Type">
            <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {rolePanelTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => patch({ type })}
                  className={`rounded-md px-5 py-1.5 text-sm font-medium transition-colors ${
                    form.type === type
                      ? 'bg-[var(--color-brand-strong)] text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {type === 'BUTTON' ? 'Buttons' : 'Dropdown'}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Channel">
              <ChannelSelect
                channels={channels}
                only="text"
                selected={form.channelId ? [form.channelId] : []}
                onChange={(ids) => patch({ channelId: ids[0] ?? '' })}
              />
            </Field>
            <Field label="Mode" hint={MODE_HINT[form.mode]}>
              <select
                className={inputClass}
                value={form.mode}
                onChange={(e) => patch({ mode: e.target.value as RolePanelMode })}
              >
                {rolePanelModes.map((mode) => (
                  <option key={mode} value={mode} className="bg-[var(--color-base-elevated)]">
                    {mode}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/80">
                Roles <span className="text-white/40">({form.options.length}/25)</span>
              </span>
              <button
                type="button"
                onClick={addOption}
                disabled={form.options.length >= 25}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:text-white disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add role
              </button>
            </div>
            {form.options.map((option, i) => (
              <div key={i} className="rounded-lg border border-white/10 p-2.5">
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-2 h-4 w-4 shrink-0 text-white/20" />
                  <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <RoleSelect
                      roles={roles}
                      selected={option.roleId ? [option.roleId] : []}
                      onChange={(ids) => setRole(i, ids[0] ?? '')}
                      placeholder="Choose a role…"
                    />
                    <input
                      className={inputClass}
                      value={option.label}
                      onChange={(e) => patchOption(i, { label: e.target.value })}
                      placeholder="Button label"
                      maxLength={80}
                    />
                    <div className="flex items-center gap-2">
                      <EmojiField
                        value={option.emoji}
                        onChange={(emoji) => patchOption(i, { emoji })}
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="rounded-md border border-white/10 p-2 text-white/50 hover:text-[var(--color-danger)]"
                        title="Remove role"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                {form.type === 'SELECT' && (
                  <input
                    className={`${inputClass} mt-2`}
                    value={option.description}
                    onChange={(e) => patchOption(i, { description: e.target.value })}
                    placeholder="Dropdown description (optional)"
                    maxLength={100}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-white/80">Preview</span>
            <PanelPreview form={form} />
          </div>

          <SaveBar
            pending={pending}
            status={status}
            onSave={create}
            label={form.editingId ? 'Save changes' : 'Create panel'}
            savedMessage={
              lastSaveWasEdit ? 'Saved. The posted panel is updated.' : 'Created and posted.'
            }
            errorMessage={
              form.editingId
                ? 'Not saved. Your changes are still here.'
                : 'Not created. Your panel is still here.'
            }
          />
          {error && status === 'error' ? (
            <p className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          {notice && status === 'saved' ? (
            <p className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2 text-sm text-[var(--color-warning)]">
              {notice}
            </p>
          ) : null}
        </GlassCard>
      </div>
    </div>
  );
}
