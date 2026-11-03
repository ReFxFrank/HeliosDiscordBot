'use client';

import { useRef, useState, useTransition } from 'react';
import {
  Check,
  ClipboardList,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ApplicationQuestion,
  ApplicationQuestionStyle,
  ApplicationsConfig,
} from '@refx/shared';
import { APPLICATION_MAX_QUESTIONS } from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import {
  createForm,
  decideSubmission,
  deleteForm,
  deployApplicationPanel,
  saveApplicationsConfig,
  updateForm,
  type FormInput,
} from '../lib/application-actions';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { cn } from '../lib/utils';

export interface FormDTO {
  id: string;
  name: string;
  description: string | null;
  reviewChannelId: string | null;
  approveRoleId: string | null;
  enabled: boolean;
  questions: ApplicationQuestion[];
}

export interface SubmissionDTO {
  id: string;
  formName: string;
  userId: string;
  createdAt: string;
  answers: { questionId: string; label: string; value: string }[];
}

interface QuestionDraft {
  key: string;
  label: string;
  style: ApplicationQuestionStyle;
  required: boolean;
  placeholder: string;
  minLength: string;
  maxLength: string;
}

interface Draft {
  id: string | null;
  name: string;
  description: string;
  reviewChannelId: string | null;
  approveRoleId: string | null;
  enabled: boolean;
  questions: QuestionDraft[];
}

const selectClass = `${inputClass} appearance-none pr-8`;

export function ApplicationsManager({
  guildId,
  initialForms,
  initialSubmissions,
  config,
  roles,
  channels,
}: {
  guildId: string;
  initialForms: FormDTO[];
  initialSubmissions: SubmissionDTO[];
  config: ApplicationsConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [forms, setForms] = useState<FormDTO[]>(initialForms);
  const [submissions, setSubmissions] = useState<SubmissionDTO[]>(initialSubmissions);
  const [staffRoleIds, setStaffRoleIds] = useState<string[]>(config.staffRoleIds);
  const [cfgStatus, setCfgStatus] = useState<SaveStatus>('idle');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [panelChannel, setPanelChannel] = useState<string | null>(null);
  const [panelMsg, setPanelMsg] = useState<string | null>(null);
  const [panelFailed, setPanelFailed] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const keyCounter = useRef(0);
  const nextKey = (): string => `q-${keyCounter.current++}`;
  const blankQuestion = (): QuestionDraft => ({
    key: nextKey(),
    label: '',
    style: 'paragraph',
    required: true,
    placeholder: '',
    minLength: '',
    maxLength: '',
  });

  function startNew(): void {
    setEditError(null);
    setEditing({
      id: null,
      name: '',
      description: '',
      reviewChannelId: null,
      approveRoleId: null,
      enabled: true,
      questions: [blankQuestion()],
    });
  }

  function startEdit(form: FormDTO): void {
    setEditError(null);
    setEditing({
      id: form.id,
      name: form.name,
      description: form.description ?? '',
      reviewChannelId: form.reviewChannelId,
      approveRoleId: form.approveRoleId,
      enabled: form.enabled,
      questions: form.questions.map((q, i) => ({
        key: `q-init-${i}`,
        label: q.label,
        style: q.style,
        required: q.required,
        placeholder: q.placeholder ?? '',
        minLength: q.minLength != null ? String(q.minLength) : '',
        maxLength: q.maxLength != null ? String(q.maxLength) : '',
      })),
    });
  }

  function patchDraft(patch: Partial<Draft>): void {
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function patchQuestion(key: string, patch: Partial<QuestionDraft>): void {
    setEditing((prev) =>
      prev
        ? { ...prev, questions: prev.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)) }
        : prev,
    );
  }

  function draftToInput(draft: Draft): FormInput {
    return {
      name: draft.name,
      description: draft.description || null,
      reviewChannelId: draft.reviewChannelId,
      approveRoleId: draft.approveRoleId,
      enabled: draft.enabled,
      questions: draft.questions
        .filter((q) => q.label.trim().length > 0)
        .map((q) => ({
          label: q.label,
          style: q.style,
          required: q.required,
          placeholder: q.placeholder || null,
          minLength: q.minLength ? Number(q.minLength) : null,
          maxLength: q.maxLength ? Number(q.maxLength) : null,
        })),
    };
  }

  // Mirror the server's normalisation so the local list matches what was stored.
  function inputToDTO(id: string, input: FormInput): FormDTO {
    return {
      id,
      name: input.name.trim().slice(0, 100),
      description: input.description?.trim().slice(0, 1000) || null,
      reviewChannelId: input.reviewChannelId || null,
      approveRoleId: input.approveRoleId || null,
      enabled: input.enabled,
      questions: input.questions.slice(0, APPLICATION_MAX_QUESTIONS).map((q, i) => ({
        id: `q${i + 1}`,
        label: q.label.trim().slice(0, 45),
        style: q.style,
        required: q.required,
        placeholder: q.placeholder?.trim() || undefined,
        minLength: q.minLength ?? undefined,
        maxLength: q.maxLength ?? undefined,
      })),
    };
  }

  function saveDraft(): void {
    if (!editing) return;
    if (!editing.name.trim()) {
      setEditError('Give the form a name.');
      return;
    }
    const input = draftToInput(editing);
    if (input.questions.length === 0) {
      setEditError('Add at least one question.');
      return;
    }
    const draftId = editing.id;
    setEditError(null);
    startTransition(async () => {
      const result = draftId
        ? await updateForm(guildId, draftId, input)
        : await createForm(guildId, input);
      if (!result.ok || !result.id) {
        setEditError(result.error ?? 'Could not save the form.');
        return;
      }
      const dto = inputToDTO(result.id, input);
      setForms((prev) =>
        draftId ? prev.map((f) => (f.id === draftId ? dto : f)) : [...prev, dto],
      );
      setEditing(null);
    });
  }

  function removeForm(form: FormDTO): void {
    if (!window.confirm(`Delete “${form.name}”? Its submissions are removed too.`)) return;
    startTransition(async () => {
      const result = await deleteForm(guildId, form.id);
      if (result.ok) {
        setForms((prev) => prev.filter((f) => f.id !== form.id));
        if (editing?.id === form.id) setEditing(null);
      }
    });
  }

  function saveConfig(): void {
    startTransition(async () => {
      const result = await saveApplicationsConfig(guildId, { staffRoleIds });
      setCfgStatus(result.ok ? 'saved' : 'error');
    });
  }

  function deploy(): void {
    if (!panelChannel) return;
    setPanelMsg(null);
    startTransition(async () => {
      const result = await deployApplicationPanel(guildId, panelChannel);
      setPanelFailed(!result.ok);
      setPanelMsg(
        result.ok
          ? 'Deploy sent — the panel should appear in the channel within a second.'
          : (result.error ?? 'Could not post the panel.'),
      );
    });
  }

  function decide(submissionId: string, status: 'APPROVED' | 'DENIED'): void {
    startTransition(async () => {
      const result = await decideSubmission(guildId, submissionId, status, notes[submissionId] ?? null);
      if (result.ok) setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Reviewers ─────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Reviewers"
        description="Roles that can approve or deny submissions from Discord (Manage Server can always review)."
      >
        <div className="max-w-xl">
          <Field label="Reviewer roles" hint="Optional. In addition to anyone with Manage Server.">
            <RoleSelect
              roles={roles}
              multiple
              placeholder="Add roles…"
              selected={staffRoleIds}
              onChange={(ids) => {
                setStaffRoleIds(ids);
                setCfgStatus('idle');
              }}
            />
          </Field>
          <div className="pt-4">
            <SaveBar pending={pending} status={cfgStatus} onSave={saveConfig} />
          </div>
        </div>
      </SettingsSection>

      {/* ── Forms ─────────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Forms"
        description="Each form is one application. Members pick a form with /apply or the panel."
      >
        <div className="flex flex-col gap-3">
          {forms.length === 0 && !editing && (
            <p className="text-sm text-white/45">No forms yet. Create your first one below.</p>
          )}

          {forms.map((form) => (
            <div
              key={form.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
            >
              <ClipboardList className="h-5 w-5 shrink-0 text-white/40" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-white/90">{form.name}</span>
                  {!form.enabled && (
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/40">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-white/45">
                  {form.questions.length} question{form.questions.length === 1 ? '' : 's'}
                  {form.reviewChannelId ? ' · review channel set' : ' · no review channel'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startEdit(form)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={() => removeForm(form)}
                disabled={pending}
                aria-label={`Delete ${form.name}`}
                className="grid h-8 w-8 place-items-center rounded-lg text-white/40 transition-colors hover:bg-[var(--color-danger)]/15 hover:text-[var(--color-danger)] disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {editing ? (
            <FormEditor
              draft={editing}
              roles={roles}
              channels={channels}
              pending={pending}
              error={editError}
              onPatch={patchDraft}
              onPatchQuestion={patchQuestion}
              onAddQuestion={() =>
                patchDraft({ questions: [...editing.questions, blankQuestion()] })
              }
              onRemoveQuestion={(key) =>
                patchDraft({ questions: editing.questions.filter((q) => q.key !== key) })
              }
              onSave={saveDraft}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <button
              type="button"
              onClick={startNew}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85"
            >
              <Plus className="h-4 w-4" /> New form
            </button>
          )}
        </div>
      </SettingsSection>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Application panel"
        description="Post a message with a button for each enabled form so members can apply with a click."
      >
        <div className="flex flex-col gap-4">
          <div className="max-w-md">
            <Field label="Channel" hint="Where the panel is posted.">
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="Select a channel…"
                selected={panelChannel ? [panelChannel] : []}
                onChange={(ids) => setPanelChannel(ids[0] ?? null)}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={deploy}
              disabled={pending || !panelChannel}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> Post panel
            </button>
            {panelMsg && (
              <span
                className={`text-sm ${panelFailed ? 'font-medium text-[var(--color-danger)]' : 'text-white/60'}`}
              >
                {panelMsg}
              </span>
            )}
          </div>
        </div>
      </SettingsSection>

      {/* ── Review queue ──────────────────────────────────────────────────── */}
      <SettingsSection
        title={`Pending submissions${submissions.length ? ` (${submissions.length})` : ''}`}
        description="Applications awaiting a decision. Approving grants the form's role and DMs the applicant."
      >
        {submissions.length === 0 ? (
          <p className="text-sm text-white/45">No pending applications right now.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold text-white/90">{submission.formName}</span>
                  <span className="text-white/40">·</span>
                  <a
                    href={`https://discord.com/users/${submission.userId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-[var(--color-brand-bright)] hover:underline"
                  >
                    {submission.userId}
                  </a>
                  <span className="ml-auto text-xs text-white/30">
                    {submission.createdAt.slice(0, 10)}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {submission.answers.map((answer, i) => (
                    <div key={`${submission.id}-${i}`}>
                      <p className="text-xs font-medium text-white/60">{answer.label}</p>
                      <p className="whitespace-pre-wrap text-sm text-white/85">
                        {answer.value || <span className="text-white/30">(blank)</span>}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className={`${inputClass} sm:flex-1`}
                    placeholder="Message to applicant (optional)"
                    maxLength={1000}
                    value={notes[submission.id] ?? ''}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [submission.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => decide(submission.id, 'APPROVED')}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-success)]/15 px-3 py-2 text-sm font-semibold text-[var(--color-success)] transition-colors hover:bg-[var(--color-success)]/25 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(submission.id, 'DENIED')}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-danger)]/15 px-3 py-2 text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/25 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" /> Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function FormEditor({
  draft,
  roles,
  channels,
  pending,
  error,
  onPatch,
  onPatchQuestion,
  onAddQuestion,
  onRemoveQuestion,
  onSave,
  onCancel,
}: {
  draft: Draft;
  roles: RoleOption[];
  channels: ChannelOption[];
  pending: boolean;
  error: string | null;
  onPatch: (patch: Partial<Draft>) => void;
  onPatchQuestion: (key: string, patch: Partial<QuestionDraft>) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (key: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand)]/[0.04] p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Form name" hint="Shown on the button and modal title.">
          <input
            className={inputClass}
            maxLength={100}
            value={draft.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </Field>
        <Field label="Review channel" hint="Where submissions post for staff. Optional.">
          <ChannelSelect
            channels={channels}
            only="text"
            placeholder="None"
            selected={draft.reviewChannelId ? [draft.reviewChannelId] : []}
            onChange={(ids) => onPatch({ reviewChannelId: ids[0] ?? null })}
          />
        </Field>
        <Field label="Description" hint="Optional context shown on the panel.">
          <input
            className={inputClass}
            maxLength={1000}
            value={draft.description}
            onChange={(e) => onPatch({ description: e.target.value })}
          />
        </Field>
        <Field label="Role on approval" hint="Granted to the applicant when approved. Optional.">
          <RoleSelect
            roles={roles}
            placeholder="None"
            selected={draft.approveRoleId ? [draft.approveRoleId] : []}
            onChange={(ids) => onPatch({ approveRoleId: ids[0] ?? null })}
          />
        </Field>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => onPatch({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-white/20 bg-white/5"
        />
        Enabled (members can apply)
      </label>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white/80">
            Questions{' '}
            <span className="font-normal text-white/40">
              ({draft.questions.length}/{APPLICATION_MAX_QUESTIONS})
            </span>
          </p>
          <button
            type="button"
            onClick={onAddQuestion}
            disabled={draft.questions.length >= APPLICATION_MAX_QUESTIONS}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add question
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {draft.questions.map((question, index) => (
            <div key={question.key} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/40">Q{index + 1}</span>
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="Question label (max 45 chars)"
                  maxLength={45}
                  value={question.label}
                  onChange={(e) => onPatchQuestion(question.key, { label: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => onRemoveQuestion(question.key)}
                  aria-label="Remove question"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/40 transition-colors hover:bg-[var(--color-danger)]/15 hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[auto_auto_1fr]">
                <div className="relative">
                  <select
                    className={selectClass}
                    value={question.style}
                    onChange={(e) =>
                      onPatchQuestion(question.key, {
                        style: e.target.value as ApplicationQuestionStyle,
                      })
                    }
                  >
                    <option value="paragraph">Paragraph</option>
                    <option value="short">Short</option>
                  </select>
                  <Chevron />
                </div>
                <label className="flex items-center gap-2 whitespace-nowrap px-1 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(e) =>
                      onPatchQuestion(question.key, { required: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-white/20 bg-white/5"
                  />
                  Required
                </label>
                <input
                  className={inputClass}
                  placeholder="Placeholder (optional)"
                  maxLength={100}
                  value={question.placeholder}
                  onChange={(e) =>
                    onPatchQuestion(question.key, { placeholder: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85 disabled:opacity-50',
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {draft.id ? 'Save form' : 'Create form'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
    >
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
