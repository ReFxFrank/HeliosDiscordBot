'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface ChartSeries {
  name: string;
  /** Validated against the card surface — see lib/insights palette notes. */
  color: string;
  values: number[];
}

const SURFACE = '#0b1322';
const W = 720;
const PAD = { top: 14, right: 56, bottom: 26, left: 44 };

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString();
}

/** Clean integer tick step (1/2/5 × 10^n) aiming for ~4 gridlines. */
function tickStep(max: number): number {
  const rough = Math.max(1, max / 4);
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const mult of [1, 2, 5, 10]) {
    if (mult * power >= rough) return mult * power;
  }
  return 10 * power;
}

function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Dependency-free SVG time-series chart (dark surface). One area-washed series
 * or a few 2px lines; crosshair + all-series tooltip on hover and arrow-key
 * focus; endpoint direct label; hairline solid grid; table twin below so no
 * value is hover-gated.
 */
export function ActivityChart({
  title,
  labels,
  series,
  height = 200,
}: {
  title: string;
  labels: string[];
  series: ChartSeries[];
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const n = labels.length;

  const { yMax, step } = useMemo(() => {
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const s = tickStep(max);
    return { yMax: Math.ceil(max / s) * s, step: s };
  }, [series]);
  const x = (i: number): number => PAD.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number): number => PAD.top + innerH - (v / yMax) * innerH;

  const paths = useMemo(
    () =>
      series.map((s) => ({
        line: s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''),
        area:
          s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('') +
          `L${x(n - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)}L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)}Z`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, n, yMax],
  );

  const ticks = Array.from({ length: Math.floor(yMax / step) }, (_, i) => {
    const v = (i + 1) * step;
    return { v, yPos: y(v) };
  });
  const xLabelEvery = Math.max(1, Math.ceil(n / 5));

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((px - PAD.left) / innerW) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, idx)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowRight') {
      setActive((cur) => Math.min(n - 1, (cur ?? n - 1) + 1));
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      setActive((cur) => Math.max(0, (cur ?? n - 1) - 1));
      event.preventDefault();
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  };

  const tooltipLeftPct = active === null ? 0 : (x(active) / W) * 100;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white/85">{title}</h3>
        {series.length >= 2 && (
          <div className="flex items-center gap-4">
            {series.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 text-xs text-white/60">
                <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        ref={wrapRef}
        className="relative outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-brand)]/60"
        tabIndex={0}
        role="img"
        aria-label={`${title} chart — use arrow keys to read values per day`}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="h-auto w-full"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
        >
          {/* Hairline grid (solid, recessive) + baseline. */}
          {ticks.map((tick) => (
            <g key={tick.v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={tick.yPos}
                y2={tick.yPos}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={tick.yPos + 3}
                textAnchor="end"
                fontSize={10}
                fill="rgba(255,255,255,0.38)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {compact(tick.v)}
              </text>
            </g>
          ))}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + innerH}
            y2={PAD.top + innerH}
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={1}
          />

          {/* X labels (sparse). */}
          {labels.map((label, i) =>
            i % xLabelEvery === 0 ? (
              <text
                key={label}
                x={x(i)}
                y={height - 8}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(255,255,255,0.38)"
              >
                {shortDate(label)}
              </text>
            ) : null,
          )}

          {/* Area wash only when a single series (a wash per series muddies). */}
          {series.length === 1 && paths[0] && (
            <path d={paths[0].area} fill={series[0]!.color} opacity={0.1} />
          )}

          {series.map((s, si) => (
            <g key={s.name}>
              <path
                d={paths[si]!.line}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* End marker with a surface ring. */}
              <circle
                cx={x(n - 1)}
                cy={y(s.values[n - 1] ?? 0)}
                r={4.5}
                fill={s.color}
                stroke={SURFACE}
                strokeWidth={2}
              />
              {/* Endpoint direct label — text token, never the series color. */}
              <text
                x={x(n - 1) + 9}
                y={y(s.values[n - 1] ?? 0) + 3.5}
                fontSize={11}
                fontWeight={600}
                fill="rgba(255,255,255,0.85)"
              >
                {compact(s.values[n - 1] ?? 0)}
              </text>
            </g>
          ))}

          {/* Crosshair + hovered markers. */}
          {active !== null && (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1}
              />
              {series.map((s) => (
                <circle
                  key={s.name}
                  cx={x(active)}
                  cy={y(s.values[active] ?? 0)}
                  r={4}
                  fill={s.color}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>

        {active !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-28 rounded-lg border border-white/10 bg-[#100c1b] px-3 py-2 shadow-xl"
            style={
              tooltipLeftPct > 62
                ? { right: `${100 - tooltipLeftPct + 2}%` }
                : { left: `${tooltipLeftPct + 2}%` }
            }
          >
            <p className="text-[10px] uppercase tracking-wide text-white/40">
              {shortDate(labels[active] ?? '')}
            </p>
            {series.map((s) => (
              <p key={s.name} className="mt-0.5 flex items-center gap-1.5 text-xs">
                <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-semibold text-white/90">
                  {(s.values[active] ?? 0).toLocaleString()}
                </span>
                <span className="text-white/45">{s.name}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Table twin — every value reachable without hovering. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-white/35 hover:text-white/60">
          View data
        </summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-left text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="text-white/40">
                <th className="py-1 pr-3 font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 pr-3 font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-white/70">
              {labels.map((label, i) => (
                <tr key={label} className="border-t border-white/5">
                  <td className="py-1 pr-3">{shortDate(label)}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 pr-3">
                      {(s.values[i] ?? 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
