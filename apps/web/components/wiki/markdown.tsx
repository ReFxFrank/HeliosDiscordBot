import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Wiki markdown renderer. No typography plugin — every element is styled
 * explicitly so the docs match Solari's design system in one place.
 */

function slugify(children: ReactNode): string {
  return String(children)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function Anchor({ href = '', children }: ComponentProps<'a'>) {
  const isInternal = href.startsWith('/') || href.startsWith('#');
  if (isInternal) {
    return (
      <Link href={href} className="text-[var(--color-brand-bright)] hover:underline">
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-brand-bright)] hover:underline"
    >
      {children}
    </a>
  );
}

export function WikiMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-white">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2
            id={slugify(children)}
            className="mb-3 mt-10 border-b border-white/10 pb-2 text-xl font-semibold text-white/90"
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 id={slugify(children)} className="mb-2 mt-6 text-base font-semibold text-white/85">
            {children}
          </h3>
        ),
        p: ({ children }) => <p className="mb-4 leading-relaxed text-white/70">{children}</p>,
        a: Anchor,
        strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>,
        ul: ({ children }) => (
          <ul className="mb-4 list-disc space-y-1.5 pl-6 text-white/70">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 list-decimal space-y-1.5 pl-6 text-white/70">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) =>
          className ? (
            // fenced block content (inside <pre>)
            <code className="font-mono text-[13px] text-white/85">{children}</code>
          ) : (
            <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[13px] text-[var(--color-brand-bright)]">
              {children}
            </code>
          ),
        pre: ({ children }) => (
          <pre className="mb-4 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-4 rounded-r-lg border-l-2 border-[var(--color-brand)] bg-[var(--color-brand)]/[0.08] px-4 py-2 text-white/75 [&>p]:mb-0">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="mb-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-white/10 bg-white/[0.04] text-white/80">{children}</thead>
        ),
        th: ({ children }) => <th className="px-3.5 py-2.5 font-semibold">{children}</th>,
        td: ({ children }) => (
          <td className="border-t border-white/[0.06] px-3.5 py-2.5 text-white/65">{children}</td>
        ),
        hr: () => <hr className="my-8 border-white/10" />,
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
