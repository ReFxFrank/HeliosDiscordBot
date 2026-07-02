'use client';

import { useEffect, useRef, type ReactNode } from 'react';

const BASE_SPEED = 55; // px/s
const HOVER_SPEED = 14; // slows on hover, never stops
const EASE = 0.06; // per-frame lerp toward the target speed

/**
 * Infinite marquee (globals.css `.marquee` supplies the edge mask). The track
 * holds the content twice and a rAF loop pans exactly one copy-width before
 * wrapping, so the loop is seamless. Hover eases the speed down to a crawl —
 * readable but alive — instead of hard-pausing. Respects reduced motion by
 * not animating at all.
 */
export function Marquee({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let offset = 0;
    let speed = BASE_SPEED;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = hovered.current ? HOVER_SPEED : BASE_SPEED;
      speed += (target - speed) * EASE;
      offset += speed * dt;
      const half = track.scrollWidth / 2;
      if (half > 0 && offset >= half) offset -= half;
      track.style.transform = `translateX(${-offset}px)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="marquee"
      onPointerEnter={() => {
        hovered.current = true;
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
    >
      <div ref={trackRef} className="marquee-track">
        <div className="flex shrink-0 items-center gap-3 pr-3">{children}</div>
        <div aria-hidden className="flex shrink-0 items-center gap-3 pr-3">
          {children}
        </div>
      </div>
    </div>
  );
}
