'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={cn(
        'block rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-white/[0.06] text-white'
          : 'text-white/55 hover:bg-white/[0.03] hover:text-white/80',
      )}
    >
      {label}
    </Link>
  );
}
