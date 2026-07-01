import type { ReactNode } from 'react';
import Link from 'next/link';
import { BRAND } from '@solari/shared';

/** Shared shell for the Terms / Privacy pages so they read consistently. */
export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-white/40 hover:text-white/70">
        ← {BRAND.name}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white/90">{title}</h1>
      <p className="mt-2 text-sm text-white/40">Last updated: {updated}</p>
      <div className="mt-4 text-sm leading-relaxed text-white/70">{intro}</div>
      <div className="mt-10 flex flex-col gap-8">{children}</div>
      <p className="mt-12 border-t border-white/5 pt-6 text-xs text-white/30">
        This document is provided as a template for the operator of this {BRAND.name} instance.
        Bracketed fields (operator name, contact, and governing law) must be completed by the
        operator, and the document should be reviewed by qualified counsel before you rely on it.
      </p>
    </main>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-white/90">{heading}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-white/65">{children}</div>
    </section>
  );
}

/** A tidy bullet list used throughout the legal copy. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-4 flex list-disc flex-col gap-1.5 marker:text-white/30">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
