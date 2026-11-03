import { BRAND } from '@refx/shared';

/**
 * ReFx brand mark. Renders `/refx-logo.png` layered over a blue letter-tile
 * fallback — if the image ever fails to load the "R" tile shows through
 * instead of a broken-image icon.
 *
 * Server-component friendly (plain <img>, no client JS). Size in px.
 */
export function BrandMark({
  size = 28,
  rounded = 'rounded-lg',
  className = '',
}: {
  size?: number;
  rounded?: string;
  className?: string;
}) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden ${rounded} bg-[var(--color-brand-strong)] font-semibold text-white ${className}`}
      style={{ height: size, width: size, fontSize: Math.round(size * 0.46) }}
    >
      {BRAND.name.slice(0, 1)}
      <img
        src="/refx-logo.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  );
}
