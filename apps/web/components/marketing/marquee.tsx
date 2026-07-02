import type { ReactNode } from 'react';

/**
 * CSS-only infinite marquee (globals.css `.marquee`): the track holds the
 * content twice and pans exactly one copy-width, so the loop is seamless.
 * Pauses on hover; the duplicate copy is hidden from screen readers.
 */
export function Marquee({ children }: { children: ReactNode }) {
  return (
    <div className="marquee">
      <div className="marquee-track">
        <div className="flex shrink-0 items-center gap-3 pr-3">{children}</div>
        <div aria-hidden className="flex shrink-0 items-center gap-3 pr-3">
          {children}
        </div>
      </div>
    </div>
  );
}
