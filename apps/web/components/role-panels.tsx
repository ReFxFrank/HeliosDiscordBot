'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, GripVertical, Plus, Send, Trash2, X } from 'lucide-react';
import {
  rolePanelInputSchema,
  rolePanelModes,
  rolePanelTypes,
  type RolePanelInput,
  type RolePanelMode,
  type RolePanelType,
} from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { createRolePanel, deleteRolePanel, redeployRolePanel } from '../lib/panel-actions';
import { GlassCard } from './ui/glass-card';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { MessagePreviewShell } from './ui/embed-builder';

export interface PanelSummary {
  id: string;
  title: string;
  mode: string;
  type: string;
  channelId: string | null;
  messageId: string | null;
  optionCount: number;
}

interface OptionDraft {
  roleId: string;
  label: string;
  emoji: string;
  description: string;
}

interface FormState {
  title: string;
  description: string;
  channelId: string;
  mode: RolePanelMode;
  type: RolePanelType;
  options: OptionDraft[];
}

const emptyOption: OptionDraft = { roleId: '', label: '', emoji: '', description: '' };
const emptyForm: FormState = {
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
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-lg hover:border-[var(--color-brand)]/60"
        title="Emoji (optional)"
      >
        {value || <span className="text-xs text-white/30">＋</span>}
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
  const [pending, startTransition] = useTransition();

  const roleName = (id: string): string => roles.find((r) => r.id === id)?.name ?? '';

  function patch(partial: Partial<FormState>): void {
    setForm((f) => ({ ...f, ...partial }));
    setStatus('idle');
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

  function create(): void {
    const candidate = buildCandidate();
    if (!rolePanelInputSchema.safeParse(candidate).success) {
      setStatus('error');
      return;
    }
    startTransition(async () => {
      const result = await createRolePanel(guildId, candidate);
      if (result.ok) {
        setForm(emptyForm);
        setStatus('saved');
      } else {
        setStatus('error');
      }
    });
  }

  function redeploy(panelId: string): void {
    startTransition(async () => {
      await redeployRolePanel(guildId, panelId);
    });
  }
  function remove(panelId: string): void {
    startTransition(async () => {
      await deleteRolePanel(guildId, panelId);
    });
  }

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
                    {panel.type} · {panel.mode} · {panel.optionCount} roles · #
                    {channelLabel(panel.channelId)} ·{' '}
                    {panel.messageId ? 'deployed' : 'not deployed'}
                  </p>
                </div>
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
      </div>

      <GlassCard className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold text-white/80">New panel</h3>
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
          label="Create panel"
          savedMessage="Created — deploying to the channel."
        />
      </GlassCard>
    </div>
  );
}
