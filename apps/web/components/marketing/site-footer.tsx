import Link from 'next/link';
import { BRAND } from '@helios/shared';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-white/40 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--color-brand-strong)] text-xs font-semibold text-white">
            {BRAND.name.slice(0, 1)}
          </span>
          <span className="text-white/70">{BRAND.name}</span>
          <span className="text-white/30">— the all-in-one Discord bot</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/pricing" className="hover:text-white/80">
            Pricing
          </Link>
          <Link href="/servers" className="hover:text-white/80">
            Dashboard
          </Link>
          <Link href="/status" className="hover:text-white/80">
            Status
          </Link>
        </div>
      </div>
    </footer>
  );
}
