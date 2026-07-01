import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, ExternalLink } from 'lucide-react';
import { BRAND } from '@solari/shared';
import { WIKI_SECTIONS } from '../../lib/wiki';
import { WikiSidebar } from '../../components/wiki/sidebar';
import { BrandMark } from '../../components/marketing/brand-mark';

export const metadata: Metadata = {
  title: { default: `${BRAND.name} Wiki`, template: `%s · ${BRAND.name} Wiki` },
  description: `Documentation for ${BRAND.name} — setup guides and reference for every module.`,
};

/** Wiki shell (/docs + wiki.solari.gg): its own top bar + sidebar, no app chrome. */
export default function WikiLayout({ children }: { children: ReactNode }) {
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[var(--color-base)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/docs" className="flex items-center gap-2 font-semibold tracking-tight text-white">
            <BrandMark size={28} />
            {BRAND.name}
            <span className="flex items-center gap-1 rounded-full bg-[var(--color-brand)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-bright)]">
              <BookOpen className="h-3 w-3" /> Wiki
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/commands"
              className="hidden text-sm text-white/60 transition-colors hover:text-white/90 sm:inline"
            >
              Commands
            </Link>
            <Link
              href="/"
              className="hidden items-center gap-1 text-sm text-white/60 transition-colors hover:text-white/90 sm:inline-flex"
            >
              solari.gg <ExternalLink className="h-3 w-3" />
            </Link>
            <a
              href={`https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=8`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[var(--color-brand-strong)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85"
            >
              Add to Discord
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 md:grid-cols-[230px_1fr]">
        <aside className="md:sticky md:top-20 md:max-h-[calc(100vh-6rem)] md:self-start md:overflow-y-auto md:pr-1">
          <WikiSidebar sections={WIKI_SECTIONS} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>

      <footer className="border-t border-white/5 px-6 py-8 text-center text-xs text-white/30">
        {BRAND.name} Wiki ·{' '}
        <Link href="/" className="text-white/50 hover:text-white/80">
          solari.gg
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className="text-white/50 hover:text-white/80">
          Terms
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className="text-white/50 hover:text-white/80">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
