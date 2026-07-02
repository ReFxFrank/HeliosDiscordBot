import Link from 'next/link';
import { Crown } from 'lucide-react';
import { BRAND } from '@solari/shared';
import { auth } from '../../auth';
import { botInviteUrl } from '../../lib/invite';
import { LoginButton } from '../auth-buttons';
import { BrandMark } from './brand-mark';
import { MobileMenu } from './mobile-menu';

/** Public marketing top nav — logo, links, the always-visible gold Premium CTA. */
export async function SiteNav() {
  const session = await auth();
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[var(--color-base)]/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
          <BrandMark size={28} />
          {BRAND.name}
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/features"
            className="hidden text-sm text-white/60 transition-colors hover:text-white/90 sm:inline"
          >
            Features
          </Link>
          <Link
            href="/commands"
            className="hidden text-sm text-white/60 transition-colors hover:text-white/90 sm:inline"
          >
            Commands
          </Link>
          <Link
            href="/docs"
            className="hidden text-sm text-white/60 transition-colors hover:text-white/90 sm:inline"
          >
            Docs
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-300/20"
          >
            <Crown className="h-3.5 w-3.5" /> Premium
          </Link>
          {session?.user ? (
            <Link
              href="/servers"
              className="rounded-full bg-[var(--color-brand-strong)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <a
                href={botInviteUrl(clientId)}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden rounded-full bg-[var(--color-brand-strong)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85 sm:inline-block"
              >
                Add to Discord
              </a>
              <LoginButton className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06]" />
            </>
          )}
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}
