import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { wikiContent, wikiNeighbors, wikiPage, wikiSectionOf } from '../../../lib/wiki';
import { WikiMarkdown } from '../../../components/wiki/markdown';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = wikiPage(slug);
  return page ? { title: page.title, description: page.description } : {};
}

export default async function WikiDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = wikiPage(slug);
  const source = await wikiContent(slug);
  if (!page || source === null) notFound();

  const section = wikiSectionOf(slug);
  const { prev, next } = wikiNeighbors(slug);

  return (
    <article>
      {section && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-brand-bright)]">
          {section.title}
        </p>
      )}
      <WikiMarkdown source={source} />

      <nav className="mt-12 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`/docs/${prev.slug}`}
            className="glass group flex items-center gap-3 rounded-xl p-4 transition-colors hover:border-[var(--color-brand)]/30"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-white/30 group-hover:text-[var(--color-brand-bright)]" />
            <span className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wide text-white/35">Previous</span>
              <span className="block truncate text-sm font-medium text-white/85">{prev.title}</span>
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/docs/${next.slug}`}
            className="glass group flex items-center justify-end gap-3 rounded-xl p-4 text-right transition-colors hover:border-[var(--color-brand)]/30"
          >
            <span className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wide text-white/35">Next</span>
              <span className="block truncate text-sm font-medium text-white/85">{next.title}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-white/30 group-hover:text-[var(--color-brand-bright)]" />
          </Link>
        )}
      </nav>
    </article>
  );
}
