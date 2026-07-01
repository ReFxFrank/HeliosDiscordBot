'use client';

import { useRef, type ReactNode } from 'react';
import { inputClass } from './form';

export interface Placeholder {
  token: string;
  label: string;
  /** Value substituted into the live preview. */
  sample: string;
}

/** Placeholder sets for the message editors (mirror lib/placeholders.ts). */
export const WELCOME_PLACEHOLDERS: Placeholder[] = [
  { token: '{user}', label: 'Mention', sample: '@NewMember' },
  { token: '{user.name}', label: 'Username', sample: 'NewMember' },
  { token: '{user.tag}', label: 'Tag', sample: 'NewMember#0001' },
  { token: '{server}', label: 'Server', sample: 'Your Server' },
  { token: '{memberCount}', label: 'Member #', sample: '1,234' },
  { token: '{accountAge}', label: 'Account age', sample: '42 days' },
];

export const LEVEL_PLACEHOLDERS: Placeholder[] = [
  { token: '{user}', label: 'Mention', sample: '@Member' },
  { token: '{level}', label: 'Level', sample: '5' },
  { token: '{server}', label: 'Server', sample: 'Your Server' },
];

/** Minimal Discord markdown: bold (**), italics (*), inline code (`). */
function renderMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={i} className="rounded bg-black/30 px-1 text-[13px]">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

function substitute(template: string, placeholders: Placeholder[]): string {
  return placeholders.reduce((out, p) => out.split(p.token).join(p.sample), template);
}

/**
 * A Discord-style message bubble showing how the message will render, with the
 * Solari bot identity. Mentions render as highlighted chips.
 */
export function DiscordPreview({
  content,
  placeholders,
}: {
  content: string;
  placeholders: Placeholder[];
}) {
  const resolved = substitute(content, placeholders);
  // Highlight @mentions produced by substitution.
  const withMentions = resolved.split(/(@[A-Za-z0-9_#]+)/g).map((chunk, i) =>
    chunk.startsWith('@') ? (
      <span key={i} className="rounded bg-[var(--color-brand)]/25 px-1 font-medium text-[var(--color-brand-bright)]">
        {chunk}
      </span>
    ) : (
      <span key={i}>{renderMarkdown(chunk)}</span>
    ),
  );

  return (
    <div className="rounded-xl border border-white/10 bg-[#2b2d31] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/30">Preview</p>
      <div className="flex gap-3">
        <img
          src="/solari-logo.png"
          alt=""
          aria-hidden
          className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-brand-strong)] object-cover"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">Solari</span>
            <span className="rounded bg-[var(--color-brand)] px-1 py-px text-[9px] font-bold uppercase text-white">
              App
            </span>
            <span className="text-xs text-white/35">Today at 12:00 PM</span>
          </div>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#dbdee1]">
            {content.trim() ? withMentions : <span className="text-white/30">Nothing to preview.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A message editor with clickable placeholder chips (insert at the caret) and a
 * live Discord preview underneath — the MEE6 message-composer pattern.
 */
export function MessageComposer({
  value,
  onChange,
  placeholders,
  rows = 3,
  maxLength = 2000,
  preview = true,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholders: Placeholder[];
  rows?: number;
  maxLength?: number;
  preview?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(token: string): void {
    const el = ref.current;
    if (!el) {
      onChange((value + token).slice(0, maxLength));
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + token + value.slice(end)).slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + token.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <textarea
        ref={ref}
        rows={rows}
        maxLength={maxLength}
        className={`${inputClass} resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {placeholders.map((p) => (
          <button
            key={p.token}
            type="button"
            onClick={() => insert(p.token)}
            title={`Insert ${p.token}`}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/70 transition-colors hover:border-[var(--color-brand)]/40 hover:text-white"
          >
            {p.label}
          </button>
        ))}
      </div>
      {preview && <DiscordPreview content={value} placeholders={placeholders} />}
    </div>
  );
}
