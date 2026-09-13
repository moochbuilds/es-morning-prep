"use client";

import { useState } from "react";

import { CHART, ChartTooltip, TooltipRow, niceScale } from "./common";

const W = 300;
const H = 96;
const P = { l: 30, r: 18, t: 10, b: 20 };

/**
 * Volatility curve from shortest to longest horizon. Upward = contango (the
 * normal state); downward = backwardation (acute, immediate stress).
 */
export function TermStructureChart({
  points,
  label,
}: {
  points: Array<{ label: string; value: number }>;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const x = (i: number) => P.l + 12 + (n === 1 ? 0 : (i / (n - 1)) * (W - P.l - P.r - 24));
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.25 || 0.5;
  const scale = niceScale(lo - pad, hi + pad, 3);
  const y = (v: number) => P.t + (1 - (v - scale.min) / (scale.max - scale.min)) * (H - P.t - P.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label}>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
            <text x={P.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={9} fill={CHART.axis}>
              {t.toFixed(scale.digits)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.label} x={x(i)} y={H - 5} textAnchor="middle" fontSize={9} fill={CHART.axis}>
            {p.label}
          </text>
        ))}
        <path d={line} fill="none" stroke={CHART.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={4} fill={CHART.accent} stroke={CHART.surface} strokeWidth={2} />
        ))}
        {points.map((p, i) => (
          <rect
            key={`hit${i}`}
            x={x(i) - 22}
            y={P.t}
            width={44}
            height={H - P.t - P.b}
            fill="transparent"
            tabIndex={0}
            aria-label={`${p.label}: ${p.value.toFixed(2)}`}
            className="cursor-crosshair focus:outline-none"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      {active !== null && (
        <ChartTooltip xPct={(x(active) / W) * 100}>
          <TooltipRow value={points[active].value.toFixed(2)} label={points[active].label} />
        </ChartTooltip>
      )}
    </div>
  );
}
