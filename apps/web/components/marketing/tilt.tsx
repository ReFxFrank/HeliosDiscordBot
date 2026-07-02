'use client';

import type { PointerEvent, ReactNode } from 'react';

const MAX_DEG = 5;

/**
 * Subtle pointer-tracking 3D tilt for hero artwork. Resets smoothly on leave;
 * inert for touch/keyboard users.
 */
export function Tilt({ children }: { children: ReactNode }) {
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.transform = `perspective(900px) rotateX(${(-y * MAX_DEG).toFixed(2)}deg) rotateY(${(x * MAX_DEG).toFixed(2)}deg)`;
  };
  const reset = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  };
  return (
    <div
      className="transition-transform duration-300 ease-out will-change-transform"
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
    >
      {children}
    </div>
  );
}
