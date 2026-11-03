'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';

export function NavLink({
  href,
  label,
  icon,
  disabledGlobally,
}: {
  href: string;
  label: string;
  /**
   * Pre-rendered icon element. It must be rendered on the server (pass `<Icon />`,
   * not the `Icon` component) — React cannot serialize a component/function across
   * the server→client boundary. The icon inherits its color from this component
   * via `currentColor`, so callers should not set a text color on it.
   */
  icon?: ReactNode;
  /** Module the bot owner has globally disabled (dimmed + tooltip). */
  disabledGlobally?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      title={disabledGlobally ? 'Temporarily disabled by the bot operator' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-[var(--color-brand)]/[0.12] font-medium text-white'
          : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85',
        disabledGlobally && 'opacity-40',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-[var(--color-brand)] shadow-[0_0_10px_var(--color-brand)]" />
      )}
      {icon && (
        <span
          className={cn(
            'inline-flex shrink-0 transition-colors',
            active ? 'text-[var(--color-brand-bright)]' : 'text-white/40 group-hover:text-white/70',
          )}
        >
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
}
