'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Clock, Code2, Plus, X } from 'lucide-react';
import type { EmbedSpec } from '@refx/shared';
import { Field } from './form';

/**
 * A reusable, live-previewing embed builder shared by every module that can
 * send an embed (custom commands, welcome, level-up, scheduled messages, …).
 *
 * It is controlled over a plain-string `EmbedDraft` rather than the zod
 * `EmbedSpec` so half-typed URLs and colors never trip validation mid-edit —
 * the consumer calls `draftToSpec()` at save time and lets the shared schema
 * validate. `specToDraft()` hydrates the editor from a stored spec.
 */

export interface EmbedFieldDraft {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedDraft {
  authorName: string;
  authorIcon: string;
  authorUrl: string;
  title: string;
  url: string;
  description: string;
  color: string;
  thumbnailUrl: string;
  imageUrl: string;
  fields: EmbedFieldDraft[];
  footer: string;
  footerIcon: string;
  timestamp: boolean;
}

export const EMPTY_EMBED_DRAFT: EmbedDraft = {
  authorName: '',
  authorIcon: '',
  authorUrl: '',
  title: '',
  url: '',
  description: '',
  color: '',
  thumbnailUrl: '',
  imageUrl: '',
  fields: [],
  footer: '',
  footerIcon: '',
  timestamp: false,
};

const DEFAULT_COLOR = '#0072ff';
const trimOrUndef = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

/** Normalize a draft into an EmbedSpec, or `undefined` when nothing renders. */
export function draftToSpec(draft: EmbedDraft): EmbedSpec | undefined {
  const fields = draft.fields
    .filter((f) => f.name.trim() && f.value.trim())
    .map((f) => ({ name: f.name.trim(), value: f.value.trim(), inline: f.inline }));

  const spec: EmbedSpec = {
    author: draft.authorName.trim()
      ? {
          name: draft.authorName.trim(),
          iconUrl: trimOrUndef(draft.authorIcon),
          url: trimOrUndef(draft.authorUrl),
        }
      : undefined,
    title: trimOrUndef(draft.title),
    description: trimOrUndef(draft.description),
    color: trimOrUndef(draft.color),
    url: trimOrUndef(draft.url),
    imageUrl: trimOrUndef(draft.imageUrl),
    thumbnailUrl: trimOrUndef(draft.thumbnailUrl),
    fields: fields.length > 0 ? fields : undefined,
    footer: trimOrUndef(draft.footer),
    footerIconUrl: trimOrUndef(draft.footerIcon),
    timestamp: draft.timestamp || undefined,
  };

  const hasContent = Boolean(
    spec.title ||
      spec.description ||
      spec.imageUrl ||
      spec.thumbnailUrl ||
      spec.footer ||
      spec.author?.name ||
      (spec.fields && spec.fields.length > 0),
  );
  return hasContent ? spec : undefined;
}

/** Hydrate the editor from a stored spec (inverse of draftToSpec). */
export function specToDraft(spec: EmbedSpec | null | undefined): EmbedDraft {
  if (!spec) return { ...EMPTY_EMBED_DRAFT };
  return {
    authorName: spec.author?.name ?? '',
    authorIcon: spec.author?.iconUrl ?? '',
    authorUrl: spec.author?.url ?? '',
    title: spec.title ?? '',
    url: spec.url ?? '',
    description: spec.description ?? '',
    color: spec.color ?? '',
    thumbnailUrl: spec.thumbnailUrl ?? '',
    imageUrl: spec.imageUrl ?? '',
    fields: (spec.fields ?? []).map((f) => ({ name: f.name, value: f.value, inline: f.inline })),
    footer: spec.footer ?? '',
    footerIcon: spec.footerIconUrl ?? '',
    timestamp: spec.timestamp ?? false,
  };
}

/** True when the draft would render into an embed. */
export function draftHasContent(draft: EmbedDraft): boolean {
  return draftToSpec(draft) !== undefined;
}

// ── Discord / Discohook JSON round-trip ─────────────────────────────────────

interface DiscordEmbedJson {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: { name?: string; url?: string; icon_url?: string };
  footer?: { text?: string; icon_url?: string };
  image?: { url?: string };
  thumbnail?: { url?: string };
  fields?: { name?: string; value?: string; inline?: boolean }[];
}

function hexToInt(hex: string): number | undefined {
  const clean = hex.replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(clean) ? Number.parseInt(clean, 16) : undefined;
}

function intToHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

function draftToJson(draft: EmbedDraft): DiscordEmbedJson {
  const spec = draftToSpec(draft) ?? {};
  const json: DiscordEmbedJson = {};
  if (spec.author?.name)
    json.author = { name: spec.author.name, url: spec.author.url, icon_url: spec.author.iconUrl };
  if (spec.title) json.title = spec.title;
  if (spec.url) json.url = spec.url;
  if (spec.description) json.description = spec.description;
  if (spec.color !== undefined) {
    const int = hexToInt(spec.color);
    if (int !== undefined) json.color = int;
  }
  if (spec.thumbnailUrl) json.thumbnail = { url: spec.thumbnailUrl };
  if (spec.imageUrl) json.image = { url: spec.imageUrl };
  if (spec.fields?.length) json.fields = spec.fields;
  if (spec.footer) json.footer = { text: spec.footer, icon_url: spec.footerIconUrl };
  if (spec.timestamp) json.timestamp = new Date().toISOString();
  return json;
}

/** Accept a bare embed, an array of embeds, or a Discohook `{embeds:[…]}` doc. */
function jsonToDraft(raw: string): EmbedDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const embed = (
    Array.isArray(parsed)
      ? parsed[0]
      : parsed && typeof parsed === 'object' && 'embeds' in parsed
        ? (parsed as { embeds?: unknown[] }).embeds?.[0]
        : parsed
  ) as DiscordEmbedJson | undefined;
  if (!embed || typeof embed !== 'object') return null;
  return {
    authorName: embed.author?.name ?? '',
    authorIcon: embed.author?.icon_url ?? '',
    authorUrl: embed.author?.url ?? '',
    title: embed.title ?? '',
    url: embed.url ?? '',
    description: embed.description ?? '',
    color: typeof embed.color === 'number' ? intToHex(embed.color) : '',
    thumbnailUrl: embed.thumbnail?.url ?? '',
    imageUrl: embed.image?.url ?? '',
    fields: (embed.fields ?? []).map((f) => ({
      name: f.name ?? '',
      value: f.value ?? '',
      inline: Boolean(f.inline),
    })),
    footer: embed.footer?.text ?? '',
    footerIcon: embed.footer?.icon_url ?? '',
    timestamp: Boolean(embed.timestamp),
  };
}

// ── Live preview (Discord message chrome, MEE6-style) ────────────────────────

/** Client-only "Today at H:MM" label — computed after mount to avoid SSR skew. */
function useTodayLabel(): string {
  const [label, setLabel] = useState('Today');
  useEffect(() => {
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setLabel(`Today at ${time}`);
  }, []);
  return label;
}

/**
 * The Discord message frame — bot avatar, name, BOT badge, timestamp — wrapping
 * whatever message body you give it. Exported so the reaction-role builder can
 * render its panel inside the same chrome.
 */
export function MessagePreviewShell({
  botName = 'ReFx Assistant',
  botAvatarUrl,
  children,
}: {
  botName?: string;
  botAvatarUrl?: string;
  children: React.ReactNode;
}) {
  const time = useTodayLabel();
  const initial = botName.trim().charAt(0).toUpperCase() || 'R';
  return (
    <div className="rounded-md bg-[#313338] p-3 text-[13px] leading-snug text-[#dbdee1]">
      <div className="flex gap-3">
        {botAvatarUrl ? (
          <img src={botAvatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#3d95ff,#005ad1)' }}
          >
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[15px] font-medium leading-none text-white">{botName}</span>
            <span className="rounded bg-[var(--color-brand-strong)] px-1 py-px text-[10px] font-semibold uppercase leading-none text-white">
              Bot
            </span>
            <span className="text-xs text-[#949ba4]">{time}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The embed card itself (colored left bar + fields), without the message frame. */
export function DiscordEmbedCard({ spec }: { spec: EmbedSpec }) {
  const accent = spec.color && /^#?[0-9a-fA-F]{6}$/.test(spec.color)
    ? `#${spec.color.replace('#', '')}`
    : DEFAULT_COLOR;
  return (
    <div
      className="max-w-[440px] rounded-[4px] bg-[#2b2d31] px-3 py-2.5"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          {spec.author?.name && (
            <div className="mb-1.5 flex items-center gap-1.5">
              {spec.author.iconUrl && (
                <img src={spec.author.iconUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
              )}
              <span className="text-xs font-semibold text-white">{spec.author.name}</span>
            </div>
          )}
          {spec.title && (
            <div className={`mb-1 font-semibold ${spec.url ? 'text-[#00a8fc]' : 'text-white'}`}>
              {spec.title}
            </div>
          )}
          {spec.description && (
            <div className="whitespace-pre-wrap break-words text-[#dbdee1]/90">
              {spec.description}
            </div>
          )}
          {spec.fields && spec.fields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {spec.fields.map((f, i) => (
                <div
                  key={i}
                  className={f.inline ? 'min-w-[30%] flex-1 basis-[30%]' : 'w-full basis-full'}
                >
                  <div className="text-xs font-semibold text-white">{f.name}</div>
                  <div className="whitespace-pre-wrap break-words text-xs text-[#dbdee1]/90">
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {spec.imageUrl && (
            <img src={spec.imageUrl} alt="" className="mt-2 max-h-52 rounded-[4px] object-cover" />
          )}
          {(spec.footer || spec.timestamp) && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#dbdee1]/60">
              {spec.footerIconUrl && spec.footer && (
                <img src={spec.footerIconUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
              )}
              {spec.footer && <span>{spec.footer}</span>}
              {spec.footer && spec.timestamp && <span>•</span>}
              {spec.timestamp && <span>just now</span>}
            </div>
          )}
        </div>
        {spec.thumbnailUrl && (
          <img
            src={spec.thumbnailUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-[4px] object-cover"
          />
        )}
      </div>
    </div>
  );
}

function Preview({
  draft,
  content,
  botName,
  botAvatarUrl,
}: {
  draft: EmbedDraft;
  content?: string;
  botName?: string;
  botAvatarUrl?: string;
}) {
  const spec = draftToSpec(draft);
  const hasContent = Boolean(content && content.trim());
  return (
    <MessagePreviewShell botName={botName} botAvatarUrl={botAvatarUrl}>
      {hasContent && (
        <div className="mb-1.5 whitespace-pre-wrap break-words text-[#dbdee1]">{content}</div>
      )}
      {spec ? (
        <DiscordEmbedCard spec={spec} />
      ) : (
        !hasContent && <div className="text-xs text-[#949ba4]">Your message will appear here.</div>
      )}
    </MessagePreviewShell>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

const smallInput =
  'w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-[var(--color-brand)]/60';

export interface EmbedVariable {
  token: string;
  desc?: string;
}

export function EmbedBuilder({
  value,
  onChange,
  variables,
  content,
  onContentChange,
  contentPlaceholder = 'Write your message here!',
  botName,
  botAvatarUrl,
}: {
  value: EmbedDraft;
  onChange: (draft: EmbedDraft) => void;
  /** Optional placeholder reference chips shown beneath the message/description. */
  variables?: EmbedVariable[];
  /** Optional plain message shown above the embed (the full "message builder"). */
  content?: string;
  onContentChange?: (value: string) => void;
  contentPlaceholder?: string;
  /** Preview identity — defaults to the ReFx Assistant bot. */
  botName?: string;
  botAvatarUrl?: string;
}) {
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const patch = (partial: Partial<EmbedDraft>): void => onChange({ ...value, ...partial });
  // Variable chips append to the message when it's editable here, else the embed body.
  const appendVar = (token: string): void => {
    if (onContentChange) onContentChange(`${content ?? ''}${token}`);
    else patch({ description: `${value.description}${token}` });
  };

  function patchField(index: number, partial: Partial<EmbedFieldDraft>): void {
    patch({ fields: value.fields.map((f, i) => (i === index ? { ...f, ...partial } : f)) });
  }
  function addField(): void {
    if (value.fields.length >= 25) return;
    patch({ fields: [...value.fields, { name: '', value: '', inline: false }] });
  }
  function removeField(index: number): void {
    patch({ fields: value.fields.filter((_, i) => i !== index) });
  }

  function importJson(): void {
    const draft = jsonToDraft(jsonText);
    if (!draft) {
      setJsonError('Not valid embed JSON.');
      return;
    }
    setJsonError(null);
    onChange(draft);
    setShowJson(false);
  }
  function loadExport(): void {
    setJsonText(JSON.stringify(draftToJson(value), null, 2));
    setJsonError(null);
    setShowJson(true);
  }

  const colorValue = /^#?[0-9a-fA-F]{6}$/.test(value.color)
    ? `#${value.color.replace('#', '')}`
    : DEFAULT_COLOR;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Editor column */}
        <div className="flex flex-col gap-3">
          {onContentChange && (
            <Field label="Message" hint="Optional text sent above the embed.">
              <textarea
                className={`${smallInput} min-h-16 resize-y`}
                value={content ?? ''}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder={contentPlaceholder}
                maxLength={2000}
              />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Author name">
              <input
                className={smallInput}
                value={value.authorName}
                onChange={(e) => patch({ authorName: e.target.value })}
                placeholder="Optional"
              />
            </Field>
            <Field label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorValue}
                  onChange={(e) => patch({ color: e.target.value })}
                  className="h-9 w-10 cursor-pointer rounded-md border border-white/10 bg-transparent p-0.5"
                  aria-label="Embed color"
                />
                <input
                  className={`${smallInput} w-24 font-mono`}
                  value={value.color}
                  onChange={(e) => patch({ color: e.target.value })}
                  placeholder="#0072ff"
                />
              </div>
            </Field>
          </div>
          {value.authorName.trim() && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={`${smallInput} font-mono`}
                value={value.authorIcon}
                onChange={(e) => patch({ authorIcon: e.target.value })}
                placeholder="Author icon URL"
              />
              <input
                className={`${smallInput} font-mono`}
                value={value.authorUrl}
                onChange={(e) => patch({ authorUrl: e.target.value })}
                placeholder="Author link URL"
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input
                className={smallInput}
                value={value.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>
            <Field label="Title URL">
              <input
                className={`${smallInput} font-mono`}
                value={value.url}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder="https://…"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              className={`${smallInput} min-h-24 resize-y`}
              value={value.description}
              onChange={(e) => patch({ description: e.target.value })}
              maxLength={4000}
            />
          </Field>
          {variables && variables.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  title={v.desc}
                  onClick={() => appendVar(v.token)}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-white/55 hover:text-white/90"
                >
                  {v.token}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={`${smallInput} font-mono`}
              value={value.thumbnailUrl}
              onChange={(e) => patch({ thumbnailUrl: e.target.value })}
              placeholder="Thumbnail URL"
            />
            <input
              className={`${smallInput} font-mono`}
              value={value.imageUrl}
              onChange={(e) => patch({ imageUrl: e.target.value })}
              placeholder="Image URL"
            />
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/80">Fields</span>
              <button
                type="button"
                onClick={addField}
                disabled={value.fields.length >= 25}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:text-white disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add field
              </button>
            </div>
            {value.fields.map((f, i) => (
              <div key={i} className="rounded-md border border-white/10 p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className={smallInput}
                    value={f.name}
                    onChange={(e) => patchField(i, { name: e.target.value })}
                    placeholder="Field name"
                    maxLength={256}
                  />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-white/60">
                    <input
                      type="checkbox"
                      checked={f.inline}
                      onChange={(e) => patchField(i, { inline: e.target.checked })}
                    />
                    Inline
                  </label>
                  <button
                    type="button"
                    onClick={() => removeField(i)}
                    className="shrink-0 rounded-md border border-white/10 p-1.5 text-white/50 hover:text-[var(--color-danger)]"
                    title="Remove field"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  className={`${smallInput} min-h-14 resize-y`}
                  value={f.value}
                  onChange={(e) => patchField(i, { value: e.target.value })}
                  placeholder="Field value"
                  maxLength={1024}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={smallInput}
              value={value.footer}
              onChange={(e) => patch({ footer: e.target.value })}
              placeholder="Footer text"
              maxLength={2048}
            />
            <input
              className={`${smallInput} font-mono`}
              value={value.footerIcon}
              onChange={(e) => patch({ footerIcon: e.target.value })}
              placeholder="Footer icon URL"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={value.timestamp}
                onChange={(e) => patch({ timestamp: e.target.checked })}
              />
              <Clock className="h-3.5 w-3.5" /> Timestamp
            </label>
            <button
              type="button"
              onClick={showJson ? () => setShowJson(false) : loadExport}
              className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"
            >
              <Code2 className="h-4 w-4" /> {showJson ? 'Hide JSON' : 'Import / export JSON'}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showJson ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showJson && (
            <div className="flex flex-col gap-2 rounded-md border border-white/10 p-3">
              <p className="text-xs text-white/45">
                Paste embed JSON (Discohook-compatible) and Import, or copy the exported JSON below.
              </p>
              <textarea
                className={`${smallInput} min-h-32 resize-y font-mono text-xs`}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{ "title": "…", "description": "…" }'
                spellCheck={false}
              />
              {jsonError && <p className="text-xs text-[var(--color-danger)]">{jsonError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={importJson}
                  className="rounded-md bg-[var(--color-brand-strong)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-brand-strong)]/85"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={loadExport}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white"
                >
                  Export current
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview column */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white/80">Preview</span>
          <Preview draft={value} content={content} botName={botName} botAvatarUrl={botAvatarUrl} />
        </div>
      </div>
    </div>
  );
}
