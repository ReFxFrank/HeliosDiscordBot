import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BRAND } from '@solari/shared';
import { WIKI_SECTIONS } from '../../lib/wiki';

export const dynamic = 'force-dynamic';

export default function WikiHomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {BRAND.name} Wiki
      </h1>
      <p className="mt-3 max-w-2xl text-white/60">
        Everything you need to set up and run {BRAND.name} — from inviting the bot to configuring
        every module. New here? Start with{' '}
        <Link href="/docs/getting-started" className="text-[var(--color-brand-bright)] hover:underline">
          Getting Started
        </Link>
        .
      </p>

      <div className="mt-10 flex flex-col gap-8">
        {WIKI_SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-white/40">
              {section.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.pages.map((page) => (
                <Link
                  key={page.slug}
                  href={`/docs/${page.slug}`}
                  className="group glass rounded-xl p-4 transition-colors hover:border-[var(--color-brand)]/30"
                >
                  <p className="flex items-center justify-between font-medium text-white/90">
                    {page.title}
                    <ArrowRight className="h-4 w-4 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-brand-bright)]" />
                  </p>
                  <p className="mt-1 text-xs text-white/50">{page.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
