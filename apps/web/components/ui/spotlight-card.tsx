'use client';

import type { PointerEvent, ReactNode } from 'react';

/**
 * Card wrapper whose `.spotlight` glow (globals.css) follows the pointer —
 * children stay server-rendered. Touch devices simply never see the hover
 * layer; nothing else changes.
 */
export function SpotlightCard({ className, children }: { className?: string; children: ReactNode }) {
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  };
  return (
    <div className={`spotlight ${className ?? ''}`} onPointerMove={onPointerMove}>
      {children}
    </div>
  );
}
