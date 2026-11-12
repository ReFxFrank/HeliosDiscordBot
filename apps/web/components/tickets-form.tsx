'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Send, Trash2 } from 'lucide-react';
import {
  TICKET_QUESTIONS_MAX,
  TICKET_TYPES_MAX,
  ticketTypeIdFromLabel,
  ticketsConfigProblems,
  type TicketQuestion,
  type TicketType,
  type TicketsConfig,
} from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveTicketsConfig } from '../lib/config-actions';
import { deployTicketPanel } from '../lib/tickets-actions';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { Switch } from './ui/switch';
import { TokenListInput } from './ui/token-list-input';

const NAME_HINT = 'Fill-ins: {number} (0042), {username}, {type}. Letters, digits and dashes only.';

/** A labelled control that isn't a single input (so it can't be a <label>). */
function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-white/80">{label}</span>
      {children}
      {hint && <span className="text-xs text-white/40">{hint}</span>}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-white/80">{label}</span>
        <span className="text-xs text-white/40">{hint}</span>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

const emptyQuestion: TicketQuestion = { label: '', placeholder: '', long: false, required: true };

/** The opening form: up to five questions shown before a ticket is created. */
function QuestionsEditor({
  questions,
  onChange,
}: {
  questions: TicketQuestion[];
  onChange: (next: TicketQuestion[]) => void;
}) {
  const set = (index: number, patch: Partial<TicketQuestion>): void =>
    onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));

  return (
    <Group
      label={`Opening questions (${questions.length}/${TICKET_QUESTIONS_MAX})`}
      hint="Shown as a pop-up form when a member opens the ticket. The answers are posted at the top of the ticket. Leave empty to open straight away."
    >
      <div className="flex flex-col gap-2">
        {questions.map((question, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg border border-white/10 p-2.5">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={question.label}
                maxLength={45}
                placeholder={`Question ${index + 1}, e.g. What do you need help with?`}
                onChange={(e) => set(index, { label: e.target.value })}
              />
              <button
                type="button"
                onClick={() => onChange(questions.filter((_, i) => i !== index))}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-white/50 hover:text-[var(--color-danger)]"
                title="Remove question"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              className={inputClass}
              value={question.placeholder}
              maxLength={100}
              placeholder="Hint inside the answer box (optional)"
              onChange={(e) => set(index, { placeholder: e.target.value })}
            />
            <div className="flex flex-wrap gap-5 text-sm text-white/70">
              <span className="flex items-center gap-2">
                <Switch
                  checked={question.long}
                  onChange={(long) => set(index, { long })}
                  label="Long answer"
                />
                Long answer
              </span>
              <span className="flex items-center gap-2">
                <Switch
                  checked={question.required}
                  onChange={(required) => set(index, { required })}
                  label="Required"
                />
                Required
              </span>
            </div>
          </div>
        ))}
        {questions.length < TICKET_QUESTIONS_MAX && (
          <button
            type="button"
            onClick={() => onChange([...questions, { ...emptyQuestion }])}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add question
          </button>
        )}
      </div>
    </Group>
  );
}

function TypeCard({
  type,
  index,
  count,
  open,
  roles,
  channels,
  onToggle,
  onChange,
  onRemove,
  onMove,
}: {
  type: TicketType;
  index: number;
  count: number;
  open: boolean;
  roles: RoleOption[];
  channels: ChannelOption[];
  onToggle: () => void;
  onChange: (patch: Partial<TicketType>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
          />
          <span className="text-base">{type.emoji}</span>
          <span className="truncate text-sm font-medium text-white/85">
            {type.label || 'Untitled type'}
          </span>
          <span className="font-mono text-[11px] text-white/30">{type.id}</span>
        </button>
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="grid h-7 w-7 place-items-center rounded text-white/40 hover:text-white disabled:opacity-30"
          title="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          className="grid h-7 w-7 place-items-center rounded text-white/40 hover:text-white disabled:opacity-30"
          title="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="grid h-7 w-7 place-items-center rounded text-white/40 hover:text-[var(--color-danger)]"
          title="Remove type"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t border-white/10 px-3 py-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Label" hint="The button text, e.g. Support, Report a member, Appeal.">
              <input
                className={inputClass}
                value={type.label}
                maxLength={80}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </Field>
            <Field label="Emoji" hint="One emoji, or <:name:id>.">
              <input
                className={inputClass}
                value={type.emoji}
                maxLength={64}
                onChange={(e) => onChange({ emoji: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Description" hint="Shown under the label when the panel is a dropdown.">
            <input
              className={inputClass}
              value={type.description}
              maxLength={100}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Group label="Category" hint="Blank uses the default category.">
              <ChannelSelect
                channels={channels}
                only="category"
                placeholder="Default category"
                selected={type.categoryId ? [type.categoryId] : []}
                onChange={(ids) => onChange({ categoryId: ids[0] ?? null })}
              />
            </Group>
            <Group label="Staff roles" hint="Blank uses the default support roles.">
              <RoleSelect
                roles={roles}
                multiple
                placeholder="Default support roles"
                selected={type.supportRoleIds}
                onChange={(ids) => onChange({ supportRoleIds: ids })}
              />
            </Group>
          </div>
          <Field label="Channel name" hint={`Blank uses the default. ${NAME_HINT}`}>
            <input
              className={`${inputClass} font-mono`}
              value={type.namePattern}
              maxLength={60}
              placeholder="e.g. report-{username}"
              onChange={(e) => onChange({ namePattern: e.target.value })}
            />
          </Field>
          <Field label="Opening message" hint="Blank uses the default opening message.">
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={type.openMessage}
              maxLength={1500}
              onChange={(e) => onChange({ openMessage: e.target.value })}
            />
          </Field>
          <QuestionsEditor
            questions={type.questions}
            onChange={(questions) => onChange({ questions })}
          />
        </div>
      )}
    </div>
  );
}

export function TicketsForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: TicketsConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<TicketsConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedPanel, setSavedPanel] = useState(() => panelKey(initial));
  const [deployMsg, setDeployMsg] = useState<string | null>(null);
  const [deployFailed, setDeployFailed] = useState(false);
  const [openType, setOpenType] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  // Ids already saved may be on a posted panel, so they never change. New ones follow the label.
  const savedIds = useMemo(() => new Set(initial.types.map((type) => type.id)), [initial.types]);

  function update<K extends keyof TicketsConfig>(key: K, value: TicketsConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  function updateType(index: number, patch: Partial<TicketType>): void {
    setConfig((prev) => {
      const types = prev.types.map((type, i) => {
        if (i !== index) return type;
        const next = { ...type, ...patch };
        if (patch.label !== undefined && !savedIds.has(type.id)) {
          const taken = prev.types.filter((_, j) => j !== index).map((t) => t.id);
          next.id = ticketTypeIdFromLabel(patch.label || 'type', taken);
        }
        return next;
      });
      return { ...prev, types };
    });
    setStatus('idle');
  }

  function addType(): void {
    setConfig((prev) => {
      const taken = prev.types.map((type) => type.id);
      // The first type starts from the single-button setup, so nothing set up so far is lost.
      const first = prev.types.length === 0;
      const label = first ? prev.buttonLabel || 'Support' : 'New type';
      const type: TicketType = {
        id: ticketTypeIdFromLabel(label, taken),
        label,
        emoji: first ? '🎫' : '',
        description: '',
        categoryId: null,
        supportRoleIds: [],
        namePattern: '',
        openMessage: '',
        questions: first ? prev.questions : [],
      };
      setOpenType(prev.types.length);
      return { ...prev, types: [...prev.types, type] };
    });
    setStatus('idle');
  }

  function removeType(index: number): void {
    update(
      'types',
      config.types.filter((_, i) => i !== index),
    );
    setOpenType(null);
  }

  function moveType(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= config.types.length) return;
    const types = [...config.types];
    const [moved] = types.splice(index, 1);
    if (moved) types.splice(target, 0, moved);
    update('types', types);
    setOpenType(target);
  }

  function save(): void {
    const problems = ticketsConfigProblems(config);
    if (problems.length > 0) {
      setSaveError(problems.join(' '));
      setStatus('error');
      return;
    }
    startTransition(async () => {
      const result = await saveTicketsConfig(guildId, config).catch(() => ({
        ok: false as const,
        error: "Couldn't reach the dashboard. Reload the page and try again.",
      }));
      setSaveError(result.ok ? null : (result.error ?? 'Could not save.'));
      setStatus(result.ok ? 'saved' : 'error');
      if (result.ok) {
        setDeployMsg(
          panelKey(config) !== savedPanel && config.panelChannelId
            ? 'The panel changed: press Deploy panel to update the one in Discord.'
            : null,
        );
        setDeployFailed(false);
        setSavedPanel(panelKey(config));
      }
    });
  }

  function deploy(): void {
    setDeployMsg(null);
    startTransition(async () => {
      const result = await deployTicketPanel(guildId).catch(() => ({
        ok: false as const,
        error: "Couldn't reach the dashboard. Reload the page and try again.",
        notice: undefined,
      }));
      setDeployFailed(!result.ok);
      setDeployMsg(
        result.ok
          ? (result.notice ?? 'Panel posted.')
          : (result.error ?? 'The panel could not be posted.'),
      );
    });
  }

  const hasTypes = config.types.length > 0;
  const unsavedPanel = panelKey(config) !== savedPanel;

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Ticket Setup"
        description="The defaults every ticket uses: where it is created, who can see it, and where transcripts go."
      >
        <div className="flex max-w-2xl flex-col gap-5">
          <Group
            label="Default category"
            hint="New ticket channels are created under this category."
          >
            <ChannelSelect
              channels={channels}
              only="category"
              placeholder="None"
              selected={config.categoryId ? [config.categoryId] : []}
              onChange={(ids) => update('categoryId', ids[0] ?? null)}
            />
          </Group>
          <Group label="Default support roles" hint="These roles see and manage tickets.">
            <RoleSelect
              roles={roles}
              multiple
              selected={config.supportRoleIds}
              onChange={(ids) => update('supportRoleIds', ids)}
            />
          </Group>
          <Group
            label="Transcript channel"
            hint="Each closed ticket's transcript and summary is posted here. None disables the log."
          >
            <ChannelSelect
              channels={channels}
              only="text"
              placeholder="None"
              selected={config.transcriptChannelId ? [config.transcriptChannelId] : []}
              onChange={(ids) => update('transcriptChannelId', ids[0] ?? null)}
            />
          </Group>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Ticket Types"
        description="Offer several kinds of ticket on one panel, each with its own category, staff, questions and channel name."
      >
        <div className="flex flex-col gap-3">
          {!hasTypes && (
            <p className="text-sm text-white/50">
              No types yet, so the panel has one button that opens a general ticket using the
              settings below. Add a type to offer a choice (for example Support, Report a member,
              Appeal).
            </p>
          )}
          {config.types.map((type, index) => (
            <TypeCard
              key={index}
              type={type}
              index={index}
              count={config.types.length}
              open={openType === index}
              roles={roles}
              channels={channels}
              onToggle={() => setOpenType(openType === index ? null : index)}
              onChange={(patch) => updateType(index, patch)}
              onRemove={() => removeType(index)}
              onMove={(delta) => moveType(index, delta)}
            />
          ))}
          {config.types.length < TICKET_TYPES_MAX && (
            <button
              type="button"
              onClick={addType}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/75 hover:text-white"
            >
              <Plus className="h-4 w-4" /> Add ticket type
            </button>
          )}
        </div>
      </SettingsSection>

      {!hasTypes && (
        <SettingsSection
          title="Opening a Ticket"
          description="The questions, channel name and message for the general ticket."
        >
          <div className="flex flex-col gap-5">
            <QuestionsEditor
              questions={config.questions}
              onChange={(questions) => update('questions', questions)}
            />
            <div className="max-w-md">
              <Field label="Channel name" hint={NAME_HINT}>
                <input
                  className={`${inputClass} font-mono`}
                  value={config.namePattern}
                  maxLength={60}
                  onChange={(e) => update('namePattern', e.target.value)}
                />
              </Field>
            </div>
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        title="Ticket Behavior"
        description="The opening message, limits, and how closing works."
      >
        <div className="flex flex-col gap-5">
          <Field
            label={hasTypes ? 'Default opening message' : 'Opening message'}
            hint="Posted at the top of every new ticket."
          >
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={config.openMessage}
              onChange={(e) => update('openMessage', e.target.value)}
              maxLength={1500}
            />
          </Field>
          {hasTypes && (
            <div className="max-w-md">
              <Field label="Default channel name" hint={NAME_HINT}>
                <input
                  className={`${inputClass} font-mono`}
                  value={config.namePattern}
                  maxLength={60}
                  onChange={(e) => update('namePattern', e.target.value)}
                />
              </Field>
            </div>
          )}
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <Field label="Max open per member">
              <input
                type="number"
                min={1}
                max={10}
                className={inputClass}
                value={config.maxOpenPerUser}
                onChange={(e) =>
                  update('maxOpenPerUser', Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                }
              />
            </Field>
            <Field label="Auto-close after (hours)" hint="Closes quiet tickets. 0 turns this off.">
              <input
                type="number"
                min={0}
                max={720}
                className={inputClass}
                value={config.autoCloseHours}
                onChange={(e) =>
                  update('autoCloseHours', Math.min(720, Math.max(0, Number(e.target.value) || 0)))
                }
              />
            </Field>
          </div>
          <div className="flex max-w-2xl flex-col gap-4">
            <ToggleRow
              label="Ping staff on new tickets"
              hint="Mention the ticket's staff roles in its first message."
              checked={config.pingSupport}
              onChange={(next) => update('pingSupport', next)}
            />
            <ToggleRow
              label="Only staff can close"
              hint="A member pressing Close asks staff to close it instead. Off lets members close their own tickets."
              checked={config.staffOnlyClose}
              onChange={(next) => update('staffOnlyClose', next)}
            />
            <ToggleRow
              label="Send the member a transcript"
              hint="When a ticket closes, DM the member who opened it the reason and a copy of the conversation. Off still tells them it closed."
              checked={config.dmTranscript}
              onChange={(next) => update('dmTranscript', next)}
            />
          </div>
          <p className="max-w-2xl text-xs text-white/40">
            Closing locks the ticket: the member loses access, a transcript is saved, and staff get
            Reopen, Transcript and Delete buttons in the channel.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Ticket Panel"
        description="The message with the button (or dropdown) members use to open a ticket."
      >
        <div className="flex flex-col gap-5">
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <Field label="Panel title">
              <input
                className={inputClass}
                value={config.panelTitle}
                onChange={(e) => update('panelTitle', e.target.value)}
                maxLength={256}
              />
            </Field>
            {hasTypes ? (
              <Group label="Style" hint="Buttons for a few types, a dropdown for many.">
                <div className="flex gap-1 rounded-lg border border-white/10 p-1">
                  {(['BUTTONS', 'DROPDOWN'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => update('panelStyle', style)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
                        config.panelStyle === style
                          ? 'bg-[var(--color-brand-strong)] text-white'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {style === 'BUTTONS' ? 'Buttons' : 'Dropdown'}
                    </button>
                  ))}
                </div>
              </Group>
            ) : (
              <Field label="Button label">
                <input
                  className={inputClass}
                  value={config.buttonLabel}
                  onChange={(e) => update('buttonLabel', e.target.value)}
                  maxLength={80}
                />
              </Field>
            )}
          </div>
          <Field label="Panel description">
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={config.panelDescription}
              onChange={(e) => update('panelDescription', e.target.value)}
              maxLength={2000}
            />
          </Field>
          <div className="max-w-md">
            <Group
              label="Panel channel"
              hint="Deploying again updates the panel already in the channel."
            >
              <ChannelSelect
                channels={channels}
                only="text"
                placeholder="None"
                selected={config.panelChannelId ? [config.panelChannelId] : []}
                onChange={(ids) => update('panelChannelId', ids[0] ?? null)}
              />
            </Group>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={deploy}
              disabled={pending || !config.panelChannelId || unsavedPanel}
              title={unsavedPanel ? 'Save your changes first' : undefined}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> Deploy panel
            </button>
            {unsavedPanel && (
              <span className="text-sm text-white/50">Save first, then deploy.</span>
            )}
            {!unsavedPanel && deployMsg && (
              <span
                className={`text-sm ${deployFailed ? 'font-medium text-[var(--color-danger)]' : 'text-white/60'}`}
              >
                {deployMsg}
              </span>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Blocked Members"
        description="Members who can't open tickets. Staff can also use /ticket block and /ticket unblock in Discord."
        defaultOpen={config.blockedUserIds.length > 0}
      >
        <div className="max-w-2xl">
          <Field
            label={`Blocked user IDs (${config.blockedUserIds.length})`}
            hint="Separate with commas or new lines. Right-click a member in Discord and choose Copy User ID (Developer Mode)."
          >
            <TokenListInput
              multiline
              className={`${inputClass} min-h-16 resize-y font-mono`}
              value={config.blockedUserIds}
              onChange={(ids) => update('blockedUserIds', ids)}
              placeholder="None"
            />
          </Field>
        </div>
      </SettingsSection>

      <div className="pt-1">
        <SaveBar
          pending={pending}
          status={status}
          onSave={save}
          errorMessage={saveError ?? 'Could not save.'}
        />
      </div>
    </div>
  );
}

/** Everything that changes how the posted panel looks; used to spot when a redeploy is due. */
function panelKey(config: TicketsConfig): string {
  return JSON.stringify([
    config.panelTitle,
    config.panelDescription,
    config.panelStyle,
    config.buttonLabel,
    config.panelChannelId,
    config.types.map((type) => [type.id, type.label, type.emoji, type.description]),
  ]);
}
