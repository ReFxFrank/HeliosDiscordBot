'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import type { WikiSection } from '../../lib/wiki';
import { cn } from '../../lib/utils';

/** Wiki navigation — searchable section/page tree with active highlighting. */
export function WikiSidebar({ sections }: { sections: WikiSection[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        pages: section.pages.filter(
          (page) =>
            page.title.toLowerCase().includes(q) || page.description.toLowerCase().includes(q),
        ),
      }))
      .filter((section) => section.pages.length > 0);
  }, [sections, query]);

  return (
    <nav className="flex flex-col gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
        <input
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-3 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-[var(--color-brand)]/60"
          placeholder="Search docs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search documentation"
        />
      </div>

      {visible.length === 0 && <p className="px-1 text-sm text-white/40">No pages match.</p>}

      {visible.map((section) => (
        <div key={section.title} className="flex flex-col gap-0.5">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
            {section.title}
          </p>
          {section.pages.map((page) => {
            const href = `/docs/${page.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={page.slug}
                href={href}
                className={cn(
                  'relative rounded-lg px-2 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-white/[0.07] font-medium text-white'
                    : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85',
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-[var(--color-brand)]" />
                )}
                {page.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
