import Link from 'next/link';
import { BRAND } from '@solari/shared';
import { BrandMark } from './brand-mark';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-white/40 sm:flex-row">
        <div className="flex items-center gap-2">
          <BrandMark size={24} rounded="rounded-md" />
          <span className="text-white/70">{BRAND.name}</span>
          <span className="text-white/30">— the all-in-one Discord bot</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/features" className="hover:text-white/80">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-white/80">
            Pricing
          </Link>
          <Link href="/commands" className="hover:text-white/80">
            Commands
          </Link>
          <Link href="/docs" className="hover:text-white/80">
            Docs
          </Link>
          <Link href="/servers" className="hover:text-white/80">
            Dashboard
          </Link>
          <Link href="/status" className="hover:text-white/80">
            Status
          </Link>
          <Link href="/terms" className="hover:text-white/80">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white/80">
            Privacy
          </Link>
          <Link href="/refund" className="hover:text-white/80">
            Refunds
          </Link>
        </div>
      </div>
    </footer>
  );
}
